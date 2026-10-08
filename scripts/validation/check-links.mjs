#!/usr/bin/env node
/**
 * Link / asset checker for the production build (dist/). Run `npm run build` first.
 *
 *   npm run check-links               internal checks only (offline)
 *   npm run check-links -- --external also requests every external link (HEAD/GET,
 *                                      2 at a time, successful results cached in .cache/external-links.json)
 *
 * Internal checks: broken page links, missing images / CSS / JS / fonts / video /
 * documents, invalid #anchors, malformed URLs, url(...) inside CSS, and accidental
 * dependencies on the original WordPress runtime (/wp-admin/, /wp-json/, /wp-includes/,
 * /wp-content/plugins|themes|cache/, admin-ajax, xmlrpc) or absolute links to the
 * original host outside SEO metadata.
 * Writes docs/link-check-report.md. Exit code 1 if anything is broken.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { ROOT } from '../build/data.mjs';
import { normalizeBase } from '../build/base-path.mjs';

const DIST = path.join(ROOT, 'dist');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const ORIGIN = site.siteUrl;
const HOST = new URL(ORIGIN).host;
// builds for a sub-path (BASE_PATH=/repo/, GitHub Pages project site) and/or another public URL (SITE_URL)
const BASE = normalizeBase(process.env.BASE_PATH);
const OWN_HOSTS = new Set([HOST, ...(process.env.SITE_URL ? [new URL(process.env.SITE_URL).host] : [])]);
const allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'validation', 'allowlist.json'), 'utf8')).urls.map((a) => a.value);
const EXTERNAL = process.argv.includes('--external');
const CMS = /\/(wp-admin|wp-json|wp-includes)\/|\/wp-content\/(plugins|themes|cache)\/|admin-ajax\.php|xmlrpc\.php/;

if (!fs.existsSync(DIST)) { console.error('dist/ not found: run npm run build first'); process.exit(1); }
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const cssFiles = files.filter((f) => f.endsWith('.css'));
const urlOf = (f) => BASE + path.relative(DIST, f).replace(/\\/g, '/').replace(/index\.html$/, '');

const problems = []; const warnings = []; const external = new Map(); let checked = 0;
const ids = new Map(); // page url -> Set(ids)
const docs = cheerio.load;
const pages = new Map();
for (const f of htmlFiles) {
  const $ = cheerio.load(fs.readFileSync(f, 'utf8'));
  pages.set(urlOf(f), $);
  ids.set(urlOf(f), new Set($('[id]').map((_, e) => $(e).attr('id')).get()));
}

function resolveLocal(p) {
  let clean;
  try { clean = decodeURIComponent(p.split(/[?#]/)[0]); } catch { return null; }
  const f = path.join(DIST, clean);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  if (fs.existsSync(path.join(f, 'index.html'))) return path.join(f, 'index.html');
  return null;
}

function check(from, kind, raw, { seo = false } = {}) {
  if (raw === undefined || raw === null) return;
  const url = raw.trim();
  checked++;
  if (!url) { problems.push(`${from}: empty ${kind}`); return; }
  if (/^(mailto|tel|data|javascript):/i.test(url)) return;
  if (url.startsWith('#')) {
    if (url !== '#' && !ids.get(from)?.has(decodeURIComponent(url.slice(1)))) problems.push(`${from}: anchor ${url} has no matching id (${kind})`);
    return;
  }
  if (CMS.test(url)) problems.push(`${from}: dependency on the WordPress runtime: ${url} (${kind})`);
  let u;
  try { u = new URL(url, 'http://local' + from); } catch { problems.push(`${from}: malformed URL "${url}" (${kind})`); return; }
  if (OWN_HOSTS.has(u.host)) {
    if (!seo) problems.push(`${from}: absolute link to the original host ${url} (${kind}); use a root-relative path`);
    return;
  }
  if (u.host !== 'local') { (external.get(u.href) || external.set(u.href, new Set()).get(u.href)).add(from); return; }
  if (!url.startsWith('/') && allow.includes(url)) { warnings.push(`${from}: ${url} (${kind}) — known pre-existing broken link (allowlist.json)`); return; }
  if (!u.pathname.startsWith(BASE)) { problems.push(`${from}: ${kind} ${url} is outside the base path ${BASE}`); return; }
  const target = resolveLocal('/' + u.pathname.slice(BASE.length));
  if (!target) { problems.push(`${from}: ${kind} ${url} → not found in dist/`); return; }
  if (u.hash && u.hash.length > 1 && target.endsWith('.html')) {
    const id = decodeURIComponent(u.hash.slice(1));
    if (!ids.get(urlOf(target))?.has(id)) problems.push(`${from}: link ${url} → anchor #${id} does not exist`);
  }
}

for (const [from, $] of pages) {
  $('a[href]').each((_, e) => check(from, 'link', $(e).attr('href')));
  $('img[src], script[src], source[src], video[src], audio[src], iframe[src], embed[src]').each((_, e) => check(from, e.tagName, $(e).attr('src')));
  $('[srcset]').each((_, e) => $(e).attr('srcset').split(',').forEach((s) => check(from, 'srcset', s.trim().split(/\s+/)[0])));
  $('link[href]').each((_, e) => { const rel = $(e).attr('rel') || ''; check(from, `link[rel=${rel}]`, $(e).attr('href'), { seo: /alternate|canonical/.test(rel) }); });
  $('[data-vidbg-mp4]').each((_, e) => check(from, 'background video', $(e).attr('data-vidbg-mp4')));
  $('[data-vidbg-poster]').each((_, e) => { const v = $(e).attr('data-vidbg-poster'); if (v) check(from, 'video poster', v); });
  $('meta[property="og:image"], meta[property="og:url"]').each((_, e) => check(from, 'og', $(e).attr('content'), { seo: true }));
  $('[style*="url("]').each((_, e) => { for (const m of $(e).attr('style').matchAll(/url\((['"]?)([^'")]+)\1\)/g)) check(from, 'inline style url()', m[2]); });
  // the WordPress runtime must not be referenced anywhere in the page source
  const html = $.html();
  const m = html.match(CMS); if (m) problems.push(`${from}: page source references the WordPress runtime (${m[0]})`);
  if (/jquery/i.test($('script[src]').map((_, e) => $(e).attr('src')).get().join(' '))) problems.push(`${from}: jQuery is still loaded`);
}
for (const f of cssFiles) {
  const from = urlOf(f);
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) if (!m[2].startsWith('data:')) check(from, 'css url()', m[2]);
}

// files in dist/ that nothing references (left-overs in public/ that can be deleted)
const allText = files.filter((f) => /\.(html|css|js|json|xml|txt)$/.test(f) || path.basename(f) === '.htaccess').map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const orphans = files.map((f) => '/' + path.relative(DIST, f).replace(/\\/g, '/'))
  .filter((u) => !/\.(html|xml|txt|json)$|\.htaccess$|\.nojekyll$|^\/assets\/(css|js)\//.test(u))
  .filter((u) => !allText.includes(u) && !allText.includes(encodeURI(u)) && !allText.includes(u.split('/').pop()));
for (const o of orphans) warnings.push(`unreferenced file ${o} (can be removed from public/)`);

// external links (optional, cached)
const cacheFile = path.join(ROOT, '.cache', 'external-links.json');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
if (EXTERNAL) {
  const todo = [...external.keys()];
  const worker = async () => {
    while (todo.length) {
      const u = todo.shift();
      // only successful checks are cached (7 days); errors are retried on every run
      if (cache[u] && !cache[u].error && cache[u].status < 400 && Date.now() - cache[u].at < 7 * 864e5) continue;
      let status = 0, error = null;
      for (const method of ['HEAD', 'GET']) {
        try {
          const res = await fetch(u, { method, redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0 link-checker' } });
          status = res.status; error = null; res.body?.cancel?.();
          if (status < 400 || status === 403) break;
        } catch (e) { error = String(e.cause?.code || e.message); }
      }
      cache[u] = { status, error, at: Date.now() };
    }
  };
  await Promise.all([1, 2].map(worker)); // 2 at a time: most links point to the same UPM servers
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}
const extRows = [...external].map(([u, from]) => ({ u, from: [...from], ...(cache[u] || {}) }));
const extBroken = extRows.filter((r) => r.status >= 400 || r.error);

let md = `# Link check report\n\nGenerated by \`npm run check-links${EXTERNAL ? ' -- --external' : ''}\` on ${new Date().toISOString()}.\n\n`;
md += `- HTML pages: ${htmlFiles.length}, CSS files: ${cssFiles.length}\n- References checked: ${checked}\n- Internal problems: ${problems.length}\n- Known pre-existing issues (allowlisted): ${warnings.length}\n- External URLs: ${external.size}${EXTERNAL ? `, unreachable/erroneous: ${extBroken.length}` : ' (not requested; run with --external)'}\n\n`;
md += `## Internal problems\n\n${problems.length ? problems.map((p) => '- ' + p).join('\n') : '_none_'}\n\n## Known pre-existing issues\n\n${warnings.length ? [...new Set(warnings)].map((p) => '- ' + p).join('\n') : '_none_'}\n\n`;
md += `## External links\n\n| URL | Status | Pages |\n|---|---|---|\n` + extRows.sort((a, b) => a.u.localeCompare(b.u)).map((r) => `| ${r.u} | ${r.error || r.status || 'not checked'} | ${r.from.length} |`).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'docs', 'link-check-report.md'), md);

console.log(`checked ${checked} references in ${htmlFiles.length} pages and ${cssFiles.length} stylesheets`);
for (const w of [...new Set(warnings)]) console.log('  ⚠ ' + w);
for (const p of problems) console.log('  ✗ ' + p);
if (EXTERNAL) for (const r of extBroken) console.log(`  ⚠ external ${r.u}: ${r.error || r.status}`);
console.log(problems.length ? `✗ ${problems.length} problem(s)` : '✓ no broken internal links or missing assets');
process.exit(problems.length ? 1 : 0);
