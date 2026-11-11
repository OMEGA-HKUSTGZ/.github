#!/usr/bin/env node
// Build the pull-request preview of a project page: copy what the lab site would publish,
// keep search engines out and say on the page that it is a draft.
//
//   node scripts/project-page-preview.mjs <page-folder> <output-folder> [path-to-leave-out ...]
//   node scripts/project-page-preview.mjs --collection <repository-folder> <output-folder>
//
// The extra paths are relative to the page folder: what the lab site's project-pages.json
// lists under "exclude" for this page (e.g. UniT's point clouds, served from a media site).
// --collection builds every page of a repository that keeps one page per folder
// (OMEGA-HKUSTGZ/project-pages) into <output-folder>/<folder>/, with a list at the top.
//
// Used by .github/workflows/project-page.yml. No dependencies.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Repository housekeeping that is not part of the page.
export const NOT_PUBLISHED = new Set(['.git', '.github', '.gitignore', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'tools', 'tests', 'node_modules', 'dist']);

const BANNER =
  '<p role="note" style="margin:0;padding:10px 16px;background:#484a47;color:#fff;font:600 14px/1.5 system-ui,sans-serif;text-align:center">' +
  'Draft preview for review. Not the official page, and not yet confirmed by the authors.</p>';

export function previewHtml(html) {
  const robots = /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/;
  if (!robots.test(html)) throw new Error('index.html has no <meta name="robots" …>; a preview must be able to switch it to noindex.');
  if (!/<body[^>]*>/.test(html)) throw new Error('index.html has no <body>.');
  return html
    .replace(robots, '<meta name="robots" content="noindex, nofollow" />')
    .replace(/[ \t]*<link\s+rel="canonical"[^>]*>\n?/, '')
    // On the lab site the page is two levels deep, so ../../ is the site root. A preview may
    // sit at another depth; previews and the lab site share a host, so say the root outright.
    .replace(/(\s(?:href|src|poster)=")\.\.\/\.\.\//g, '$1/')
    .replace(/<body[^>]*>/, (body) => `${body}\n    ${BANNER}`);
}

export function buildPreview(page, out, exclude = []) {
  const source = resolve(page);
  const target = resolve(out);
  const left = exclude.map((path) => {
    const clean = normalize(path);
    if (isAbsolute(path) || clean === '.' || clean === '..' || clean.startsWith(`..${sep}`)) throw new Error(`"${path}" must be a path inside the page folder, such as assets/media/point-clouds.`);
    return join(source, clean);
  });
  if (!existsSync(join(source, 'index.html'))) throw new Error(`${source} has no index.html.`);
  if (target === source || target.startsWith(source + sep)) throw new Error('The output folder must be outside the page folder.');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, {
    recursive: true,
    filter: (path) => path === source || !(NOT_PUBLISHED.has(basename(path)) || left.includes(path)),
  });
  writeFileSync(join(target, 'index.html'), previewHtml(readFileSync(join(source, 'index.html'), 'utf8')));
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Every page of a repository that keeps one page per folder, and a list of them. */
export function buildCollectionPreview(repository, out) {
  const source = resolve(repository);
  const target = resolve(out);
  if (target === source || target.startsWith(source + sep)) throw new Error('The output folder must be outside the repository folder.');
  const names = readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !NOT_PUBLISHED.has(entry.name) && existsSync(join(source, entry.name, 'index.html')))
    .map((entry) => entry.name)
    .sort();
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const items = names.map((name) => {
    buildPreview(join(source, name), join(target, name));
    const title = readFileSync(join(source, name, 'index.html'), 'utf8').match(/<title>([^<]*)<\/title>/)?.[1].replace(/\s+—\s+OMEGA Lab$/, '').trim() || name;
    return `      <li><a href="${name}/">${escape(title)}</a></li>`;
  });
  writeFileSync(
    join(target, 'index.html'),
    `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <meta name="robots" content="noindex, nofollow" />\n    <title>Project page drafts — OMEGA Lab</title>\n    <style>body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#1f2321}main{max-width:720px;margin:0 auto;padding:32px 20px}li{margin:8px 0}a{color:#1f5f5b}</style>\n  </head>\n  <body>\n    ${BANNER}\n    <main>\n      <h1>Project page drafts</h1>\n      <ul>\n${items.join('\n')}\n      </ul>\n    </main>\n  </body>\n</html>\n`,
  );
  return names;
}

// Run as a script (the path may go through a symlink, such as /tmp on macOS).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const collection = process.argv[2] === '--collection';
  const [page, out, ...exclude] = process.argv.slice(collection ? 3 : 2);
  try {
    if (!page || !out || (collection && exclude.length)) throw new Error('Usage: project-page-preview.mjs <page-folder> <output-folder> [path-to-leave-out ...]\n       project-page-preview.mjs --collection <repository-folder> <output-folder>');
    if (collection) {
      const names = buildCollectionPreview(page, out);
      console.log(`Preview of ${names.length} page${names.length === 1 ? '' : 's'} built in ${out}: ${names.join(', ')}.`);
      process.exit(0);
    }
    buildPreview(page, out, exclude);
    console.log(`Preview of ${page} built in ${out}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
