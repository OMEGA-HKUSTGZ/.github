// Tests for the project-page template: the scaffold, the page check and the preview build.
//   node --test templates/project-page/test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildPreview } from '../../scripts/project-page-preview.mjs';
import { countLines } from '../../scripts/repo-shape.mjs';
import { createPage, updatePage } from './new-page.mjs';
import { checkPage } from './site/tools/check.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==', 'base64');

/** A scaffolded page with every placeholder filled, the way a finished page looks. */
function filledPage() {
  const dir = mkdtempSync(join(tmpdir(), 'project-page-'));
  createPage(dir, { slug: 'example-project', title: 'Example' });
  for (const file of ['index.html', 'README.md']) {
    const path = join(dir, file);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/TODO(: [^<"|\n,}]*)?/g, 'Example text'));
  }
  for (const media of ['teaser.png', 'method.png', 'demo-poster.jpg', 'demo.mp4']) writeFileSync(join(dir, 'assets/media', media), PNG);
  return dir;
}
const edit = (dir, change) => writeFileSync(join(dir, 'index.html'), change(readFileSync(join(dir, 'index.html'), 'utf8')));
const problems = (dir) => checkPage(dir).problems.join('\n');

test('a fresh scaffold lists what is left to fill in, and nothing else', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'project-page-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  createPage(dir, { slug: 'example-project', title: 'Example' });
  const found = checkPage(dir).problems;
  assert.ok(found.length > 10);
  const other = found.filter((line) => !/template placeholder|does not exist/.test(line));
  assert.deepEqual(other, []);
  assert.doesNotMatch(readFileSync(join(dir, 'index.html'), 'utf8'), /\{\{/);
  assert.match(readFileSync(join(dir, '.github/workflows/page.yml'), 'utf8'), /slug: example-project/);
  assert.ok(countLines(readFileSync(join(dir, 'AGENTS.md'), 'utf8')) <= 60);
});

test('a filled page passes', (t) => {
  const dir = filledPage();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = checkPage(dir);
  assert.deepEqual(result.problems, []);
  assert.equal(result.slug, 'example-project');
});

test('createPage refuses bad input and existing pages', (t) => {
  const dir = filledPage();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => createPage(dir, { slug: 'example-project', title: 'Example' }), /already has an index\.html/);
  assert.throws(() => createPage(join(dir, 'new'), { slug: 'Bad Slug', title: 'Example' }), /--slug/);
  assert.throws(() => createPage(join(dir, 'new'), { slug: 'ok', title: '' }), /--title/);
});

test('the check rejects what would break or mislead', async (t) => {
  const cases = {
    'a video without an evidence label': [(html) => html.replace(' data-evidence="simulation"', ''), /a <video> must sit in a <figure data-evidence/],
    'an evidence tag that says something else': [(html) => html.replace('data-evidence="simulation"', 'data-evidence="hil"'), /needs the visible tag <span class="evidence-tag">Hardware-in-the-loop<\/span>/],
    'an unknown kind of evidence': [(html) => html.replace('data-evidence="simulation"', 'data-evidence="flight"'), /is not one of simulation, hil, real-world, animation/],
    'a root-absolute path': [(html) => html.replace('href="../../research/"', 'href="/research/"'), /must be a relative path/],
    'a missing media file': [(html) => html.replace('assets/media/method.png', 'assets/media/nope.png'), /"assets\/media\/nope\.png" does not exist/],
    'a link to a section that is gone': [(html) => html.replace('id="demos"', 'id="videos"'), /no element has id="demos"/],
    'a script from another site': [(html) => html.replace('src="assets/js/omega-page.js?v=1"', 'src="https://cdn.example.com/x.js"'), /loads from another site/],
    'an image without alt text': [(html) => html.replace(/ alt="Example text"/, ''), /needs an alt attribute/],
    'a table outside its scroll wrapper': [(html) => html.replace('<div class="table-wrap">', '<div>'), /inside <div class="table-wrap">/],
    'a noindex official page': [(html) => html.replace('content="index, follow"', 'content="noindex"'), /must be "index, follow"/],
    'a canonical address elsewhere': [(html) => html.replace('rel="canonical" href="https://omega-hkustgz.github.io/projects/example-project/"', 'rel="canonical" href="https://example.com/"'), /rel="canonical"> must be/],
    'a slug that differs from the workflow': [(html) => html.replaceAll('/projects/example-project/', '/projects/other/'), /slug is "example-project", but the canonical address says "other"/],
    'no paper link': [(html) => html.replace(/>Paper </, '>Preprint <'), /must start with a "Paper" link/],
    'no BibTeX': [(html) => html.replace('@misc{', 'misc{'), /must hold the BibTeX entry/],
  };
  for (const [name, [change, expected]] of Object.entries(cases))
    await t.test(name, (t) => {
      const dir = filledPage();
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      edit(dir, change);
      assert.match(problems(dir), expected);
    });
});

test('a commented-out block is ignored', (t) => {
  const dir = filledPage();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  edit(dir, (html) => html.replace('</main>', '<!-- TODO later: <video src="x.mp4"></video> <img src="/x.png"> -->\n</main>'));
  assert.deepEqual(checkPage(dir).problems, []);
});

test('large media is sent to a media repository', (t) => {
  const dir = filledPage();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  truncateSync(join(dir, 'assets/media/demo.mp4'), 21 * 1024 * 1024);
  assert.match(problems(dir), /demo\.mp4: 21\.0 MiB is over the 20 MiB limit/);
  truncateSync(join(dir, 'assets/media/demo.mp4'), 19 * 1024 * 1024);
  for (const name of ['a.mp4', 'b.mp4']) {
    writeFileSync(join(dir, 'assets/media', name), '');
    truncateSync(join(dir, 'assets/media', name), 19 * 1024 * 1024);
  }
  assert.match(problems(dir), /assets\/media: 59\.8 MB is over the 50 MB limit/);
});

test('the preview is a noindex draft of what the lab site would publish', (t) => {
  const dir = filledPage();
  const out = mkdtempSync(join(tmpdir(), 'project-page-preview-'));
  t.after(() => [dir, out].forEach((path) => rmSync(path, { recursive: true, force: true })));
  buildPreview(dir, out);
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.doesNotMatch(html, /index, follow|rel="canonical"/);
  assert.match(html, /<body>\s*<p role="note"[^>]*>Draft preview for review/);
  for (const kept of ['assets/css/omega-page.css', 'assets/js/omega-page.js', 'assets/media/teaser.png']) assert.ok(existsSync(join(out, kept)), kept);
  for (const dropped of ['AGENTS.md', 'README.md', 'tools', '.github', '.gitignore']) assert.ok(!existsSync(join(out, dropped)), dropped);
  assert.throws(() => buildPreview(dir, join(dir, 'dist')), /outside the page folder/);
  // A page can leave out what the lab site does not publish either (its "exclude" list).
  buildPreview(dir, out, ['assets/media']);
  assert.ok(!existsSync(join(out, 'assets/media')) && existsSync(join(out, 'assets/css/omega-page.css')));
  for (const outside of ['../elsewhere', '/tmp', '.']) assert.throws(() => buildPreview(dir, out, [outside]), /inside the page folder/);
  edit(dir, (page) => page.replace(/<meta name="robots"[^>]*>/, ''));
  assert.throws(() => buildPreview(dir, out), /no <meta name="robots"/);
});

test('--update restores shared files and leaves the page alone', (t) => {
  const dir = filledPage();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const index = readFileSync(join(dir, 'index.html'), 'utf8');
  writeFileSync(join(dir, 'assets/css/omega-page.css'), '/* edited */');
  writeFileSync(join(dir, 'assets/css/page.css'), '.mine { color: red; }');
  rmSync(join(dir, 'tools/serve.mjs'));
  assert.deepEqual(updatePage(dir).sort(), ['assets/css/omega-page.css', 'tools/serve.mjs']);
  assert.deepEqual(updatePage(dir), []);
  assert.equal(readFileSync(join(dir, 'index.html'), 'utf8'), index);
  assert.equal(readFileSync(join(dir, 'assets/css/page.css'), 'utf8'), '.mine { color: red; }');
  assert.deepEqual(checkPage(dir).problems, []);
  mkdirSync(join(dir, 'empty'));
  assert.throws(() => updatePage(join(dir, 'empty')), /not a project page/);
});

test('the commands work from the shell, also through a symlinked folder', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'project-page-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  symlinkSync(fileURLToPath(new URL('.', import.meta.url)), join(dir, 'template'));
  const run = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8' });
  const created = run(join(dir, 'template/new-page.mjs'), join(dir, 'page'), '--slug', 'example-project', '--title', 'Example');
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /Created /);
  symlinkSync(join(dir, 'page'), join(dir, 'link'));
  const checked = run(join(dir, 'link/tools/check.mjs'));
  assert.equal(checked.status, 1);
  assert.match(checked.stderr, /template placeholder/);
  assert.equal(run(join(dir, 'template/new-page.mjs'), join(dir, 'page'), '--update').status, 0);
  assert.equal(run(join(dir, 'template/new-page.mjs')).status, 1);
});
