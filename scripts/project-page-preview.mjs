#!/usr/bin/env node
// Build the pull-request preview of a project page: copy what the lab site would publish,
// keep search engines out and say on the page that it is a draft.
//
//   node scripts/project-page-preview.mjs <page-folder> <output-folder>
//
// Used by .github/workflows/project-page.yml. No dependencies.
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
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
    .replace(/<body[^>]*>/, (body) => `${body}\n    ${BANNER}`);
}

export function buildPreview(page, out) {
  const source = resolve(page);
  const target = resolve(out);
  if (!existsSync(join(source, 'index.html'))) throw new Error(`${source} has no index.html.`);
  if (target === source || target.startsWith(source + sep)) throw new Error('The output folder must be outside the page folder.');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, {
    recursive: true,
    filter: (path) => path === source || !NOT_PUBLISHED.has(basename(path)),
  });
  writeFileSync(join(target, 'index.html'), previewHtml(readFileSync(join(source, 'index.html'), 'utf8')));
}

// Run as a script (the path may go through a symlink, such as /tmp on macOS).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [page, out] = process.argv.slice(2);
  try {
    if (!page || !out) throw new Error('Usage: project-page-preview.mjs <page-folder> <output-folder>');
    buildPreview(page, out);
    console.log(`Preview of ${page} built in ${out}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
