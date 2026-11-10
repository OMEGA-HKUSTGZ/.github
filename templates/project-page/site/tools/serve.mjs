#!/usr/bin/env node
// Serve this page on your own machine at the depth it has on the lab site, so the ../../
// links and relative media paths behave as they will when published.
//
//   node tools/serve.mjs [port]      then open the address it prints
//
// Supports HTTP Range (video seeking). Lab-site links are sent on to the official site.
// This file comes from the project-page template in OMEGA-HKUSTGZ/.github.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? 4390);
const slug = readFileSync(join(root, 'index.html'), 'utf8').match(/rel="canonical" href="[^"]*\/projects\/([^/"]+)\//)?.[1] ?? 'page';
const base = `/projects/${slug}/`;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (!path.startsWith(base)) {
    response.writeHead(302, { Location: path === '/' ? base : `https://omega-hkustgz.github.io${path}` }).end();
    return;
  }
  let file = normalize(join(root, path.slice(base.length)));
  if (file !== root && !file.startsWith(root + sep)) return void response.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return void response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  const { size } = statSync(file);
  const headers = { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) return void response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return void (request.method === 'HEAD' ? response.end() : createReadStream(file, { start, end }).pipe(response));
  }
  response.writeHead(200, { ...headers, 'Content-Length': size });
  request.method === 'HEAD' ? response.end() : createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}${base}`));
