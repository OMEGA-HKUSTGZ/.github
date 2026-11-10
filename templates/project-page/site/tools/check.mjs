#!/usr/bin/env node
// Check an OMEGA project page before it is committed. CI runs the same command.
//
//   node tools/check.mjs [page-folder]
//
// Exits 1 and lists what to fix. No dependencies. This file comes from the project-page
// template in OMEGA-HKUSTGZ/.github and is the same in every page repository.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SITE = 'https://omega-hkustgz.github.io';
// Standard R7: larger media goes to a separate public media repository.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 50_000_000;
// What a clip or photo is evidence of, and the tag the reader sees.
export const EVIDENCE = {
  simulation: 'Simulation',
  hil: 'Hardware-in-the-loop',
  'real-world': 'Real-world',
  animation: 'Animation',
};

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const read = (path) => readFileSync(path, 'utf8');
const stripComments = (text) =>
  text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function attributes(source) {
  const found = {};
  for (const [, name, , value] of source.matchAll(/([\w:-]+)(\s*=\s*"([^"]*)")?/g))
    found[name.toLowerCase()] = value ?? '';
  return found;
}

/** Tags of an HTML document in order: { name, closing, attrs, index, end }. */
function tags(html) {
  return [...html.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g)].map((match) => ({
    closing: match[1] === '/',
    name: match[2].toLowerCase(),
    attrs: match[1] === '/' ? {} : attributes(match[3]),
    index: match.index,
    end: match.index + match[0].length,
  }));
}

function walk(dir, visit, base = dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, visit, base);
    else visit(path, relative(base, path).split(sep).join('/'));
  }
}

export function checkPage(root) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath)) return { problems: ['index.html is missing: the page is the index.html at the repository root.'] };

  const raw = read(indexPath);
  const html = stripComments(raw);
  const all = tags(html);
  const where = (index) => `index.html:${lineOf(html, index)}`;

  // 1. Nothing left over from the template.
  for (const file of ['index.html', 'README.md', 'AGENTS.md', 'assets/css/page.css', '.github/workflows/page.yml']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const text = file.endsWith('.html') ? html : read(path);
    for (const match of text.matchAll(/\{\{[^}]*\}\}|\bTODO\b/g))
      fail(`${file}:${lineOf(text, match.index)}: "${match[0]}" is a template placeholder. Fill it in, or delete the element or section if the page has nothing to put there.`);
  }

  // 2. Head: the address, the link preview and indexing.
  const metas = all.filter((tag) => tag.name === 'meta');
  const meta = (key) => metas.find((tag) => tag.attrs.name === key || tag.attrs.property === key)?.attrs.content;
  const canonical = all.find((tag) => tag.name === 'link' && tag.attrs.rel === 'canonical')?.attrs.href ?? '';
  const slug = canonical.match(new RegExp(`^${SITE}/projects/(${SLUG})/$`))?.[1];
  if (!slug) fail(`index.html: <link rel="canonical"> must be ${SITE}/projects/<slug>/ (lowercase letters, digits and hyphens); found "${canonical}".`);
  if (slug && meta('og:url') !== canonical) fail(`index.html: og:url must equal the canonical address ${canonical}.`);
  if (meta('robots') !== 'index, follow')
    fail('index.html: <meta name="robots"> must be "index, follow". Pull-request previews are switched to noindex by the workflow; the source describes the official page.');
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1].trim() ?? '';
  if (!/\S — OMEGA Lab$/.test(title)) fail('index.html: <title> must read "<Project> — OMEGA Lab".');
  for (const key of ['description', 'og:title', 'og:description', 'og:image', 'og:image:alt'])
    if (!meta(key)?.trim()) fail(`index.html: <meta> "${key}" is missing or empty.`);
  const image = meta('og:image') ?? '';
  if (slug && image && !image.startsWith(canonical)) fail(`index.html: og:image must be an absolute address under ${canonical} (link previews do not resolve relative paths).`);
  else if (slug && image && !existsSync(join(root, image.slice(canonical.length).split(/[?#]/)[0])))
    fail(`index.html: og:image points to ${image.slice(canonical.length)}, which does not exist.`);
  const workflow = join(root, '.github/workflows/page.yml');
  if (slug && existsSync(workflow)) {
    const configured = read(workflow).match(/^\s*slug:\s*['"]?([^\s'"#]+)/m)?.[1];
    if (configured !== slug) fail(`.github/workflows/page.yml: slug is "${configured}", but the canonical address says "${slug}". They must match.`);
  }

  // 3. Every address the page loads or links to.
  const ids = new Set(all.map((tag) => tag.attrs.id).filter(Boolean));
  const local = (file, reference, from, label) => {
    const path = reference.split(/[?#]/)[0];
    if (!path) return;
    const target = resolve(from, path);
    if (relative(root, target).startsWith('..')) fail(`${label}: "${reference}" points outside the page. Only ../../ links to the lab site may leave it.`);
    else if (!existsSync(target)) fail(`${label}: "${reference}" does not exist (${relative(root, target)}).`);
  };
  for (const tag of all) {
    for (const name of ['href', 'src', 'poster']) {
      const value = tag.attrs[name];
      if (value === undefined || tag.name === 'meta') continue;
      const label = `${where(tag.index)}: <${tag.name} ${name}>`;
      if (value.trim() === '') fail(`${label} is empty.`);
      else if (value.startsWith('#')) {
        if (value.length > 1 && !ids.has(value.slice(1))) fail(`${label}: no element has id="${value.slice(1)}". Remove the link or restore the section.`);
      } else if (/^(mailto:|tel:)/.test(value)) continue;
      else if (value.startsWith('http://')) fail(`${label}: "${value}" must use https.`);
      else if (value.startsWith('https://')) {
        if (tag.name !== 'a' && tag.name !== 'iframe' && !(tag.name === 'link' && tag.attrs.rel === 'canonical'))
          fail(`${label}: "${value}" loads from another site. Keep styles, scripts, fonts, images and video in this repository (large media: a lab media repository, by relative path).`);
      } else if (value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(value))
        fail(`${label}: "${value}" must be a relative path. The page is served under /projects/<slug>/ and, in previews, under /preview/<name>/.`);
      else if (value.startsWith('../../')) continue; // the lab site, two levels up
      else local('index.html', value, root, label);
    }
  }
  const cssDir = join(root, 'assets/css');
  if (existsSync(cssDir))
    for (const name of readdirSync(cssDir).filter((file) => file.endsWith('.css'))) {
      const css = read(join(cssDir, name)).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, , reference] of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
        if (reference.startsWith('data:')) continue;
        if (/^(https?:)?\/\//.test(reference) || reference.startsWith('/')) fail(`assets/css/${name}: url(${reference}) must be a relative path inside the page.`);
        else local(name, reference, cssDir, `assets/css/${name}: url()`);
      }
    }
  const home = all.find((tag) => tag.name === 'a' && /\bwordmark\b/.test(tag.attrs.class ?? ''));
  if (home?.attrs.href !== '../../') fail('index.html: the header wordmark must link to "../../" (the lab site home).');

  // 4. The parts every project page has.
  const count = (name) => all.filter((tag) => tag.name === name && !tag.closing).length;
  if (count('h1') !== 1) fail(`index.html: there must be exactly one <h1> (the project name); found ${count('h1')}.`);
  const block = (className) => html.match(new RegExp(`<(ul|ol|div)\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`))?.[2];
  if (!/<li\b/.test(block('authors') ?? '')) fail('index.html: <ul class="authors"> must list the authors, in the paper\'s order.');
  if (!/<li\b/.test(block('affiliations') ?? '')) fail('index.html: <ol class="affiliations"> must list the affiliations as printed on the paper.');
  if (!/<a\b[^>]*href="https:\/\/[^"]+"[^>]*>\s*Paper\b/.test(block('actions') ?? '')) fail('index.html: <div class="actions"> must start with a "Paper" link to the public paper.');
  if (!/<pre\b[^>]*id="bibtex"[^>]*>[\s\S]*?@\w+\{[\s\S]*?<\/pre>/.test(html)) fail('index.html: <pre id="bibtex"> must hold the BibTeX entry.');
  for (const id of ['main', 'overview', 'citation']) if (!ids.has(id)) fail(`index.html: the element with id="${id}" is missing.`);

  // 5. Images describe themselves and reserve their space; tables can scroll.
  for (const tag of all.filter((entry) => entry.name === 'img')) {
    if (tag.attrs.alt === undefined) fail(`${where(tag.index)}: <img> needs an alt attribute (alt="" only for decoration).`);
    if (!/^\d+$/.test(tag.attrs.width ?? '') || !/^\d+$/.test(tag.attrs.height ?? '')) fail(`${where(tag.index)}: <img> needs width and height attributes (the file's pixel size), so the page does not jump while loading.`);
  }
  for (const tag of all.filter((entry) => entry.name === 'table' && !entry.closing))
    if (!/<div\b[^>]*class="[^"]*\btable-wrap\b[^"]*"[^>]*>\s*$/.test(html.slice(0, tag.index)))
      fail(`${where(tag.index)}: put the <table> directly inside <div class="table-wrap"> so it scrolls sideways on phones.`);

  // 6. Demonstration material says what it is.
  const figures = [];
  let sections = [];
  for (let i = 0; i < all.length; i += 1) {
    const tag = all[i];
    if (tag.name === 'section') tag.closing ? sections.pop() : sections.push(tag.attrs.id ?? '');
    else if (tag.name === 'figure' && !tag.closing) figures.push({ tag, evidence: tag.attrs['data-evidence'], label: null, inDemos: sections.includes('demos') });
    else if (tag.name === 'figure') {
      const figure = figures.pop();
      if (!figure) continue;
      const at = where(figure.tag.index);
      if (figure.evidence === undefined) {
        if (figure.inDemos) fail(`${at}: a <figure> in the demos section needs data-evidence (${Object.keys(EVIDENCE).join(', ')}).`);
      } else if (!EVIDENCE[figure.evidence]) fail(`${at}: data-evidence="${figure.evidence}" is not one of ${Object.keys(EVIDENCE).join(', ')}.`);
      else if (figure.label !== EVIDENCE[figure.evidence])
        fail(`${at}: data-evidence="${figure.evidence}" needs the visible tag <span class="evidence-tag">${EVIDENCE[figure.evidence]}</span> in its caption${figure.label ? ` (found "${figure.label}")` : ''}.`);
    } else if (tag.name === 'video' && !tag.closing) {
      if (!figures.some((figure) => figure.evidence !== undefined))
        fail(`${where(tag.index)}: a <video> must sit in a <figure data-evidence="…"> that says whether it is simulation, hardware-in-the-loop, real-world or an animation.`);
    } else if (tag.name === 'span' && /\bevidence-tag\b/.test(tag.attrs.class ?? '')) {
      const figure = figures.findLast((entry) => entry.evidence !== undefined);
      const text = html.slice(tag.end, html.indexOf('<', tag.end)).trim();
      if (figure) figure.label = text;
      else fail(`${where(tag.index)}: an evidence tag must be inside a <figure data-evidence="…">.`);
    }
  }

  // 7. Size: large media does not ride along with every site publish.
  let mediaBytes = 0;
  let files = 0;
  walk(root, (path, name) => {
    const size = statSync(path).size;
    files += 1;
    if (name.startsWith('assets/media/')) mediaBytes += size;
    if (size > MAX_FILE_BYTES) fail(`${name}: ${(size / 1048576).toFixed(1)} MiB is over the 20 MiB limit for one file. Compress it, or put it in a lab media repository and load it by relative path.`);
  });
  if (mediaBytes > MAX_MEDIA_BYTES) fail(`assets/media: ${(mediaBytes / 1e6).toFixed(1)} MB is over the 50 MB limit for one page. Compress the media, or move the large files to a lab media repository.`);

  // 8. Scripts parse.
  for (const dir of ['assets/js', 'tools'])
    if (existsSync(join(root, dir)))
      for (const name of readdirSync(join(root, dir)).filter((file) => /\.m?js$/.test(file))) {
        const result = spawnSync(process.execPath, ['--check', join(root, dir, name)], { encoding: 'utf8' });
        if (result.status !== 0) fail(`${dir}/${name}: does not parse.\n${result.stderr.trim()}`);
      }

  return { problems, slug, files, mediaBytes };
}

// Run as a script (the path may go through a symlink, such as /tmp on macOS).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const { problems, slug, files, mediaBytes } = checkPage(root);
  if (problems.length) {
    console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'} in ${root}:\n`);
    for (const problem of problems) console.error(`- ${problem}`);
    console.error('\nHow a project page is put together: https://github.com/OMEGA-HKUSTGZ/.github/tree/main/templates/project-page');
    process.exit(1);
  }
  console.log(`Project page "${slug}" passes: ${files} files, ${(mediaBytes / 1e6).toFixed(1)} MB of media.`);
}
