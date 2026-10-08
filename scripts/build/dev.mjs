#!/usr/bin/env node
/**
 * Development mode: builds the site into .cache/dev-dist, serves it on http://localhost:8080 and
 * rebuilds + reloads the browser whenever something in data/, src/ or public/ changes.
 * Content errors are printed in the terminal and shown in the browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from './build.mjs';
import { startServer } from './serve.mjs';
import { ROOT } from './data.mjs';

const PORT = Number(process.env.PORT || 8080);
// development builds go to .cache/dev-dist so dist/ always holds a clean production build
const OUT = path.join(ROOT, '.cache', 'dev-dist');
const clients = new Set();
let lastError = null;

async function rebuild(reason) {
  try {
    await build({ dev: true, quiet: true, outDir: OUT });
    lastError = null;
    console.log(`[dev] rebuilt${reason ? ` (${reason})` : ''}`);
  } catch (e) {
    lastError = e.message;
    console.error(`[dev] build failed:\n${e.message}`);
  }
  for (const res of clients) res.write(`data: ${JSON.stringify({ error: lastError })}\n\n`);
}

const reloadJs = `(() => {
  const es = new EventSource('/__dev/events');
  es.onmessage = (m) => {
    const { error } = JSON.parse(m.data);
    let box = document.getElementById('__dev_error');
    if (error) {
      if (!box) { box = document.createElement('pre'); box.id = '__dev_error'; box.style.cssText = 'position:fixed;inset:auto 0 0 0;max-height:50vh;overflow:auto;margin:0;padding:16px;background:#2b0000;color:#ffb4b4;font:13px/1.4 monospace;z-index:99999;white-space:pre-wrap'; document.body.appendChild(box); }
      box.textContent = 'Build failed:\\n' + error;
    } else location.reload();
  };
})();`;

await rebuild('start');
await startServer({
  port: PORT,
  dir: OUT,
  onRequest(req, res) {
    if (req.url === '/__dev/reload.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(reloadJs); return true; }
    if (req.url === '/__dev/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return true;
    }
    return false;
  },
});
console.log(`[dev] http://localhost:${PORT}  (watching data/, src/, public/ — Ctrl+C to stop)`);

let timer = null;
for (const dir of ['data', 'src', 'public']) {
  fs.watch(path.join(ROOT, dir), { recursive: true }, (_, file) => {
    clearTimeout(timer);
    timer = setTimeout(() => rebuild(`${dir}/${file}`), 150);
  });
}
