#!/usr/bin/env node
// Start an OMEGA project page from the template, or refresh the shared files of one.
//
//   node templates/project-page/new-page.mjs <folder> --slug lightvln --title "LightVLN"
//   node templates/project-page/new-page.mjs <folder> --update
//
// The first form copies site/ into <folder> (which must not hold a page yet) and fills in the
// slug and title; everything still to write is marked TODO, and tools/check.mjs lists it.
// --update replaces only the shared files (styles, script, fonts, brand mark, tools) and
// leaves the page's own content alone. No dependencies.
//
// New pages go into OMEGA-HKUSTGZ/project-pages, one folder per page:
//   node templates/project-page/new-page.mjs <project-pages checkout>/lightvln --slug lightvln --title "LightVLN"
//   node templates/project-page/new-page.mjs <project-pages checkout> --update
// There the folder gets the page alone; the tools, AGENTS.md and the workflow are the
// repository's, and --update on the repository refreshes its tools and every page.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), 'site');
// The same in every page repository; a page never edits these.
export const SHARED = ['assets/css/omega-page.css', 'assets/js/omega-page.js', 'assets/fonts', 'assets/brand', 'tools/check.mjs', 'tools/serve.mjs'];
// What a repository has once, and a page folder inside it does not repeat.
const REPOSITORY_ONLY = /^(\.github\/|tools\/|AGENTS\.md$|\.gitignore$)/;
const TEXT = /\.(html|md|yml|css|mjs|js|json|txt)$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function files(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path, base) : [relative(base, path).split(sep).join('/')];
  });
}

/** A repository that keeps one page per folder: the shared tools, and no page at its root. */
export const isCollection = (dir) => existsSync(join(dir, 'tools/check.mjs')) && !existsSync(join(dir, 'index.html'));

export function createPage(target, { slug, title }) {
  if (!SLUG.test(slug ?? '')) throw new Error('--slug must be lowercase letters, digits and hyphens, e.g. lightvln. It becomes /projects/<slug>/.');
  if (!title?.trim()) throw new Error('--title is the project name shown as the page heading, e.g. "LightVLN".');
  if (/[<>&"]/.test(title)) throw new Error('--title must be plain text without < > & or quotes.');
  if (existsSync(join(target, 'index.html'))) throw new Error(`${target} already has an index.html. Use --update to refresh its shared files.`);
  const inCollection = isCollection(dirname(resolve(target)));
  if (inCollection && resolve(target).split(sep).at(-1) !== slug) throw new Error(`In a repository of pages the folder is the slug: use ${join(dirname(target), slug)}.`);
  const wanted = files(site).filter((file) => !(inCollection && REPOSITORY_ONLY.test(file)));
  mkdirSync(target, { recursive: true });
  for (const file of wanted) {
    const to = join(target, file);
    mkdirSync(dirname(to), { recursive: true });
    if (!TEXT.test(file) || SHARED.some((shared) => file === shared || file.startsWith(`${shared}/`))) cpSync(join(site, file), to);
    else writeFileSync(to, readFileSync(join(site, file), 'utf8').replaceAll('{{slug}}', slug).replaceAll('{{title}}', title.trim()));
  }
  return wanted;
}

export function updatePage(target) {
  if (isCollection(target)) {
    const tools = refresh(target, SHARED.filter((shared) => REPOSITORY_ONLY.test(shared)));
    const pages = readdirSync(target, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(target, entry.name, 'index.html')));
    return [...tools, ...pages.flatMap((entry) => updatePage(join(target, entry.name)).map((file) => `${entry.name}/${file}`))];
  }
  if (!existsSync(join(target, 'index.html'))) throw new Error(`${target} has no index.html, so it is not a project page.`);
  return refresh(target, SHARED.filter((shared) => !(isCollection(dirname(resolve(target))) && REPOSITORY_ONLY.test(shared))));
}

function refresh(target, sharedPaths) {
  const changed = [];
  for (const shared of sharedPaths) {
    const from = join(site, shared);
    for (const file of statSync(from).isDirectory() ? files(from).map((name) => `${shared}/${name}`) : [shared]) {
      const to = join(target, file);
      const next = readFileSync(join(site, file));
      if (existsSync(to) && readFileSync(to).equals(next)) continue;
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, next);
      changed.push(file);
    }
  }
  return changed;
}

// Run as a script (the path may go through a symlink, such as /tmp on macOS).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const target = args.find((arg, i) => !arg.startsWith('--') && !['--slug', '--title'].includes(args[i - 1]));
  try {
    if (!target) throw new Error('Usage: new-page.mjs <folder> --slug <slug> --title "<Title>"   |   new-page.mjs <folder> --update');
    if (args.includes('--update')) {
      const changed = updatePage(resolve(target));
      console.log(changed.length ? `Refreshed ${changed.length} shared file(s):\n${changed.map((file) => `  ${file}`).join('\n')}` : 'Shared files are already current.');
    } else {
      createPage(resolve(target), { slug: value('--slug'), title: value('--title') });
      const check = isCollection(dirname(resolve(target))) ? join(dirname(target), 'tools/check.mjs') : join(target, 'tools/check.mjs');
      console.log(`Created ${target}. Next: fill in index.html and README.md, add media under assets/media/, then run\n  node ${check}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
