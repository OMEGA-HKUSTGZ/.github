import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkRepo, countLines, headings } from './repo-shape.mjs';

const SCRIPT = fileURLToPath(new URL('./repo-shape.mjs', import.meta.url));
const ENGLISH = '# Repo\n\n## What this is\n\nx\n\n## Where to write\n\n## How to check\n\n## Pitfalls\n';
const CHINESE = '# 仓库\n\n## 这是什么\n\n## 写在哪里\n\n## 怎么检查\n\n## 坑\n';

const dirs = [];
function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'repo-shape-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

test('a repository with English or Chinese sections passes', () => {
  assert.deepEqual(checkRepo(repo({ 'AGENTS.md': ENGLISH, 'README.md': '# R\n' })), []);
  assert.deepEqual(checkRepo(repo({ 'AGENTS.md': CHINESE, 'README.md': '# R\n' })), []);
});

test('headings match case-insensitively, at any level, and in bilingual form', () => {
  const text = '### WHAT THIS IS\n## 写在哪里 / Where to write\n## **How to check:**\n# pitfalls #\n';
  assert.deepEqual(checkRepo(repo({ 'AGENTS.md': text, 'README.md': '' })), []);
});

test('a missing AGENTS.md says what to add', () => {
  const errors = checkRepo(repo({ 'README.md': '# R\n' }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /AGENTS\.md is missing\. Add AGENTS\.md at the repository root/);
  assert.match(errors[0], /What this is/);
});

test('lowercase agents.md does not count', () => {
  const errors = checkRepo(repo({ 'agents.md': ENGLISH, 'README.md': '' }));
  assert.ok(errors.some((e) => e.startsWith('AGENTS.md is missing')));
});

test('AGENTS.md over 60 lines is rejected with the count', () => {
  const sixty = ENGLISH + 'x\n'.repeat(60 - countLines(ENGLISH));
  assert.deepEqual(checkRepo(repo({ 'AGENTS.md': sixty, 'README.md': '' })), []);
  const errors = checkRepo(repo({ 'AGENTS.md': sixty + 'x\n', 'README.md': '' }));
  assert.deepEqual(errors, [
    'AGENTS.md has 61 lines; the limit is 60. Move 1 or more lines of detail into docs/ and link to them.',
  ]);
});

test('each missing section is named', () => {
  const errors = checkRepo(repo({ 'AGENTS.md': '## What this is\n## Pitfalls\n', 'README.md': '' }));
  assert.equal(errors.length, 2);
  assert.match(errors[0], /no "写在哪里" or "Where to write" section/);
  assert.match(errors[1], /no "怎么检查" or "How to check" section/);
});

test('headings inside code fences and plain text do not count', () => {
  const text = '## What this is\n## Where to write\n```md\n## How to check\n```\nHow to check\n## Pitfalls\n';
  const errors = checkRepo(repo({ 'AGENTS.md': text, 'README.md': '' }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /How to check/);
});

test('README.md is required', () => {
  assert.deepEqual(checkRepo(repo({ 'AGENTS.md': ENGLISH })), [
    'README.md is missing. Add README.md at the repository root: what the repository is, for people.',
  ]);
});

test('CLAUDE.md may only import AGENTS.md', () => {
  assert.deepEqual(checkRepo(repo({ 'AGENTS.md': ENGLISH, 'README.md': '', 'CLAUDE.md': '@AGENTS.md\n' })), []);
  const errors = checkRepo(repo({ 'AGENTS.md': ENGLISH, 'README.md': '', 'CLAUDE.md': '@AGENTS.md\nAlso do X.\n' }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /CLAUDE\.md must contain only the line "@AGENTS\.md"/);
});

test('CONTRIBUTING.md is rejected at the root, in .github and in docs', () => {
  const errors = checkRepo(
    repo({
      'AGENTS.md': ENGLISH,
      'README.md': '',
      'CONTRIBUTING.md': '',
      '.github/CONTRIBUTING.md': '',
      'docs/CONTRIBUTING.md': '',
    }),
  );
  assert.deepEqual(
    errors.map((e) => e.split(' ')[0]),
    ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md'],
  );
  assert.match(errors[0], /Fold its agent-facing rules into AGENTS\.md/);
});

test('countLines matches wc -l', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('a'), 1);
  assert.equal(countLines('a\n'), 1);
  assert.equal(countLines('a\r\nb\r\n'), 2);
});

test('headings splits bilingual headings', () => {
  assert.deepEqual(headings('## 坑 / Pitfalls'), ['坑 / pitfalls', '坑', 'pitfalls']);
});

test('the command exits 0 when the shape is right and 1 with the reasons otherwise', () => {
  const good = repo({ 'AGENTS.md': ENGLISH, 'README.md': '' });
  assert.match(execFileSync(process.execPath, [SCRIPT, good], { encoding: 'utf8' }), /Repository shape OK/);

  const bad = repo({ 'README.md': '' });
  let failure;
  try {
    execFileSync(process.execPath, [SCRIPT, bad], { encoding: 'utf8', stdio: 'pipe', env: { PATH: process.env.PATH } });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.status, 1);
  assert.match(failure.stderr, /^error: AGENTS\.md is missing/);
  assert.match(failure.stderr, /1 problem\(s\)/);
});
