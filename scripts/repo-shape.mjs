#!/usr/bin/env node
// Check that a repository has the shape the OMEGA infra standard (R2) asks for:
// https://github.com/OMEGA-HKUSTGZ/.github-private/blob/main/STANDARD.md
//
//   node scripts/repo-shape.mjs [repository-folder]
//
// Exits 1 and lists what to fix when the shape is wrong. No dependencies.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_AGENTS_LINES = 60;

// Each required AGENTS.md section, with the heading texts that name it.
export const SECTIONS = [
  { names: ['这是什么', 'What this is'] },
  { names: ['写在哪里', 'Where to write'] },
  { names: ['怎么检查', 'How to check'] },
  { names: ['坑', 'Pitfalls'] },
];

const STANDARD = 'https://github.com/OMEGA-HKUSTGZ/.github-private/blob/main/STANDARD.md';

// Names in one folder, matched exactly (macOS file systems ignore case).
function entries(dir) {
  try {
    return new Set(readdirSync(dir));
  } catch {
    return new Set();
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// Lines as `wc -l` counts them: a final newline does not start another line.
export function countLines(text) {
  if (text === '') return 0;
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.length;
}

const normalize = (text) =>
  text
    .replace(/[*_`]/g, '')
    .replace(/[\s:：。.]+$/u, '')
    .trim()
    .toLowerCase();

// Markdown ATX headings outside fenced code blocks, normalized for matching.
// A bilingual heading such as "这是什么 / What this is" yields both halves.
export function headings(text) {
  const found = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!heading) continue;
    const full = normalize(heading[1]);
    found.push(full, ...full.split(/\s*[/|｜]\s*/).map(normalize));
  }
  return found;
}

export function checkRepo(dir) {
  const errors = [];
  const root = entries(dir);

  if (!root.has('AGENTS.md') || !isFile(join(dir, 'AGENTS.md'))) {
    errors.push(
      `AGENTS.md is missing. Add AGENTS.md at the repository root (at most ${MAX_AGENTS_LINES} lines) with the sections ` +
        SECTIONS.map((s) => s.names.join(' / ')).join(', ') +
        `, linking to the standard: ${STANDARD}`,
    );
  } else {
    const text = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    const lines = countLines(text);
    if (lines > MAX_AGENTS_LINES) {
      errors.push(
        `AGENTS.md has ${lines} lines; the limit is ${MAX_AGENTS_LINES}. Move ${lines - MAX_AGENTS_LINES} or more lines of detail into docs/ and link to them.`,
      );
    }
    const found = new Set(headings(text));
    for (const section of SECTIONS) {
      if (!section.names.some((name) => found.has(normalize(name)))) {
        errors.push(
          `AGENTS.md has no "${section.names.join('" or "')}" section. Add a heading such as "## ${section.names[0]}" (Chinese) or "## ${section.names[1]}" (English).`,
        );
      }
    }
  }

  if (!root.has('README.md')) {
    errors.push('README.md is missing. Add README.md at the repository root: what the repository is, for people.');
  }

  if (root.has('CLAUDE.md')) {
    const text = readFileSync(join(dir, 'CLAUDE.md'), 'utf8').trim();
    if (text !== '@AGENTS.md') {
      errors.push(
        'CLAUDE.md must contain only the line "@AGENTS.md". Move its other content into AGENTS.md (or docs/), or delete CLAUDE.md.',
      );
    }
  }

  for (const folder of ['', '.github', 'docs']) {
    if (entries(join(dir, folder)).has('CONTRIBUTING.md')) {
      const path = folder ? `${folder}/CONTRIBUTING.md` : 'CONTRIBUTING.md';
      errors.push(
        `${path} should not exist. Fold its agent-facing rules into AGENTS.md, move the rest for people into README.md or docs/, delete it, and fix links to it.`,
      );
    }
  }

  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = resolve(process.argv[2] ?? '.');
  const errors = checkRepo(dir);
  if (errors.length === 0) {
    console.log(`Repository shape OK: ${dir}`);
  } else {
    for (const error of errors) {
      console.error(process.env.GITHUB_ACTIONS ? `::error::${error}` : `error: ${error}`);
    }
    console.error(`\n${errors.length} problem(s). The rules are in R2 of ${STANDARD}`);
    process.exit(1);
  }
}
