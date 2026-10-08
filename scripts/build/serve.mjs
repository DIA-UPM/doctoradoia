#!/usr/bin/env node
/**
 * Minimal static file server for dist/ (no dependencies).
 *   npm run serve            -> serves the production build on http://localhost:8080
 *   npm run dev              -> builds, serves, rebuilds on changes and reloads the browser
 * Behaves like nginx/Apache for this site: /path/ -> /path/index.html, 404 -> 404.html.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './data.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.ico': 'image/x-icon' };

export function startServer({ port = 8080, dir = path.join(ROOT, 'dist'), onRequest } = {}) {
  const server = http.createServer((req, res) => {
    if (onRequest && onRequest(req, res)) return;
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
    let file = path.join(dir, p);
    if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) {
      // language-specific 404 page (e.g. /language/en/404.html), as configured for nginx/Apache in the README
      const langNf = path.join(dir, (p.match(/^\/language\/[a-z]{2}\//) || [''])[0], '404.html');
      const nf = fs.existsSync(langNf) ? langNf : path.join(dir, '404.html');
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
    }
    const stat = fs.statSync(file);
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range; // needed for <video> seeking in some browsers
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      let [s, e] = range.slice(6).split('-').map((x) => (x === '' ? undefined : Number(x)));
      s ??= 0; e ??= stat.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
      return fs.createReadStream(file, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const port = Number(process.env.PORT || 8080);
  startServer({ port }).then(() => console.log(`Serving dist/ on http://localhost:${port}`));
}
