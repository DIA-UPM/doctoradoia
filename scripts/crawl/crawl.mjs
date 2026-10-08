#!/usr/bin/env node
/**
 * Snapshot crawler for https://doctoradoia.dia.fi.upm.es/
 *
 * - Seeds from the Yoast sitemap + homepage, follows same-host links.
 * - Renders every page in Chromium (Playwright), scrolls to trigger lazy loading
 *   and records every network response the page makes.
 * - Also parses raw + rendered HTML (src, srcset, data-src, data-srcset, href,
 *   inline style url()) and CSS files (url(), @import) for extra resources.
 * - Downloads same-host resources into .cache/crawl/files/ (cached: an existing
 *   file is never re-downloaded unless --refresh is passed).
 * - Writes .cache/crawl/report.json (machine readable) and
 *   docs/crawl-report.md (human readable).
 *
 * Usage: npm run crawl [-- --refresh]
 */
import '../lib/env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

const ORIGIN = 'https://doctoradoia.dia.fi.upm.es';
const HOST = new URL(ORIGIN).host;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const OUT = path.join(ROOT, '.cache', 'crawl');
const FILES = path.join(OUT, 'files');
const PAGES = path.join(OUT, 'pages');
const REFRESH = process.argv.includes('--refresh');
const DELAY_MS = 300;          // politeness delay between requests
// external hosts whose assets are needed for rendering (web fonts) and are downloaded locally
const ASSET_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const SYSTEM_PAGES = {
  _404: `${ORIGIN}/pagina-inexistente-static-migration/`,
  _404_en: `${ORIGIN}/language/en/page-that-does-not-exist-static-migration/`,
  _search: `${ORIGIN}/?s=tesis`,
  _search_none: `${ORIGIN}/?s=zqxwvut`,
  _search_en: `${ORIGIN}/language/en/?s=thesis`,
};
const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|zip|rtf|txt)$/i;

fs.mkdirSync(FILES, { recursive: true });
fs.mkdirSync(PAGES, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const commentedOriginals = new Set();
const report = { origin: ORIGIN, startedAt: new Date().toISOString(), pages: {}, resources: {}, redirects: [], failures: [], external: {} };

function normalize(u, base) {
  try {
    const url = new URL(u.replace(/&#038;/g, '&').replace(/&amp;/g, '&').trim(), base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    if (url.host === HOST) url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}
const isInternal = (u) => new URL(u).host === HOST;
// images embedded from other hosts are part of the rendering too (e.g. the footer campus logo)
const isDownloadable = (u) => isInternal(u) || ASSET_HOSTS.has(new URL(u).host) || /\.(png|jpe?g|gif|svg|webp)$/i.test(new URL(u).pathname);
const isPageUrl = (u) => {
  const p = new URL(u).pathname;
  return isInternal(u) && !/\.[a-z0-9]{2,5}$/i.test(p) && !/^\/(wp-|feed|xmlrpc|comments)/.test(p) && !new URL(u).search;
};

/** local path for a downloaded resource; query strings are hashed into the name */
function localFileFor(u) {
  const url = new URL(u);
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index';
  if (url.search) {
    const h = crypto.createHash('md5').update(url.search).digest('hex').slice(0, 8);
    const ext = path.extname(p);
    p = p.slice(0, p.length - ext.length) + '__q' + h + ext;
  }
  return path.join(FILES, url.host, p);
}

function classify(u) {
  const p = new URL(u).pathname;
  if (ASSET_HOSTS.has(new URL(u).host)) return 'A-required(external-font)';
  if (!isInternal(u)) return isDownloadable(u) ? 'A-required(external-image)' : 'E-external';
  if (/^\/wp-(admin|json)|xmlrpc|wp-emoji|comment-reply|wp-embed/.test(p)) return 'B-cms-runtime';
  if (/\/wp-content\/cache\//.test(p)) return 'A-required(cms-cache-bundle)';
  return 'A-required';
}

async function download(u, referrer) {
  if (report.resources[u]?.status) { report.resources[u].referencedBy.add?.(referrer); return report.resources[u]; }
  const rec = report.resources[u] ||= { url: u, referencedBy: new Set(), class: classify(u) };
  if (referrer) rec.referencedBy.add(referrer);
  if (!isDownloadable(u)) return rec;
  const file = localFileFor(u);
  rec.file = path.relative(ROOT, file).replace(/\\/g, '/');
  const meta = file + '.meta.json';
  if (!REFRESH && fs.existsSync(file) && fs.existsSync(meta)) {
    Object.assign(rec, JSON.parse(fs.readFileSync(meta, 'utf8')), { cached: true });
    return rec;
  }
  await sleep(DELAY_MS);
  try {
    const res = await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 static-migration-crawler' } });
    if (res.status >= 300 && res.status < 400) {
      const to = normalize(res.headers.get('location'), u);
      report.redirects.push({ from: u, to, status: res.status });
      rec.status = res.status; rec.redirectTo = to;
      if (to) { const r2 = await download(to, referrer); Object.assign(rec, { finalFile: r2.file }); }
      return rec;
    }
    rec.status = res.status;
    rec.contentType = res.headers.get('content-type');
    if (!res.ok) { report.failures.push({ url: u, status: res.status, referrer }); return rec; }
    const buf = Buffer.from(await res.arrayBuffer());
    rec.bytes = buf.length;
    rec.sha1 = crypto.createHash('sha1').update(buf).digest('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    fs.writeFileSync(meta, JSON.stringify({ status: rec.status, contentType: rec.contentType, bytes: rec.bytes, sha1: rec.sha1 }));
  } catch (e) {
    rec.status = 0; rec.error = String(e);
    report.failures.push({ url: u, error: String(e), referrer });
  }
  return rec;
}

/** resource references inside an HTML document */
function htmlRefs(html, base) {
  const $ = cheerio.load(html);
  const refs = new Set();
  const links = new Set();
  const add = (v) => { const n = v && normalize(v, base); if (n) refs.add(n); };
  $('link[href]').each((_, el) => { const rel = ($(el).attr('rel') || '').toLowerCase(); if (/stylesheet|icon|preload|manifest/.test(rel)) add($(el).attr('href')); });
  $('script[src], img[src], source[src], video[src], audio[src], iframe[src], embed[src]').each((_, el) => add($(el).attr('src')));
  $('video[poster]').each((_, el) => add($(el).attr('poster')));
  for (const attr of ['srcset', 'data-srcset']) $(`[${attr}]`).each((_, el) => $(el).attr(attr).split(',').forEach((s) => add(s.trim().split(/\s+/)[0])));
  for (const attr of ['data-src', 'data-bg', 'data-background', 'data-lazy-src', 'data-vidbg-bg', 'data-pdf-url', 'data-video']) $(`[${attr}]`).each((_, el) => add($(el).attr(attr)));
  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => add($(el).attr('content')));
  $('[style]').each((_, el) => cssUrls($(el).attr('style'), base).forEach((u) => refs.add(u)));
  $('style').each((_, el) => cssUrls($(el).html(), base).forEach((u) => refs.add(u)));
  // WP Fastest Cache replaces the theme/plugin files by minified bundles and leaves the
  // original tags inside HTML comments. The originals are downloaded as clean sources.
  for (const m of html.matchAll(/<!--\s*<(?:link[^>]+href|script[^>]+src)=['"]([^'"]+)['"][^>]*>(?:\s*<\/script>)?\s*-->/g)) { const n = normalize(m[1], base); if (n) { refs.add(n); commentedOriginals.add(n); } }
  $('a[href]').each((_, el) => { const n = normalize($(el).attr('href'), base); if (n) links.add(n); });
  // pdf embedder plugin keeps the pdf url in a data attribute or in href of the block
  $('[data-pdf-url], a.pdfemb-viewer').each((_, el) => add($(el).attr('data-pdf-url') || $(el).attr('href')));
  return { refs, links };
}

function cssUrls(css, base) {
  const out = [];
  if (!css) return out;
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) if (!m[2].startsWith('data:')) { const n = normalize(m[2], base); if (n) out.push(n); }
  for (const m of css.matchAll(/@import\s+(['"])([^'"]+)\1/g)) { const n = normalize(m[2], base); if (n) out.push(n); }
  return out;
}

async function main() {
  const seeds = new Set([ORIGIN + '/']);
  try {
    const idx = await (await fetch(ORIGIN + '/wp-sitemap.xml')).text();
    for (const m of idx.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const sm = await (await fetch(m[1])).text();
      for (const p of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) seeds.add(normalize(p[1]));
    }
  } catch (e) { console.warn('sitemap failed', e.message); }
  report.sitemapUrls = [...seeds];

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const queue = [...seeds];
  const seen = new Set(queue);
  const allLinks = new Map(); // link -> Set(pages)

  while (queue.length) {
    const u = queue.shift();
    const page = await ctx.newPage();
    const netSeen = new Set();
    page.on('response', (r) => { const n = normalize(r.url()); if (n && n !== u) netSeen.add(n); });
    let status = 0, finalUrl = u, rendered = '', raw = '';
    try {
      const res = await page.goto(u, { waitUntil: 'networkidle', timeout: 60000 });
      status = res?.status() ?? 0;
      finalUrl = normalize(page.url());
      const chain = []; let req = res?.request();
      while (req?.redirectedFrom()) { req = req.redirectedFrom(); chain.push(req.url()); }
      if (chain.length) report.redirects.push({ from: chain.at(-1), to: finalUrl, status: 'page-redirect' });
      raw = (await res?.text()) ?? '';
      // scroll through the page to trigger lazy loading / scroll animations
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await page.waitForLoadState('networkidle').catch(() => {});
      rendered = await page.content();
    } catch (e) {
      report.failures.push({ url: u, error: String(e), type: 'page' });
    }
    await page.close();
    const slug = (new URL(u).pathname.replace(/^\/|\/$/g, '') || '_home').replace(/\//g, '__');
    fs.writeFileSync(path.join(PAGES, slug + '.raw.html'), raw);
    fs.writeFileSync(path.join(PAGES, slug + '.rendered.html'), rendered);
    const $ = cheerio.load(raw || '<html></html>');
    report.pages[u] = {
      url: u, finalUrl, status, slug,
      title: $('title').text(),
      lang: $('html').attr('lang'),
      canonical: $('link[rel=canonical]').attr('href') || null,
      description: $('meta[name=description]').attr('content') || null,
      hreflang: $('link[rel=alternate][hreflang]').map((_, el) => ({ lang: $(el).attr('hreflang'), href: $(el).attr('href') })).get(),
      networkResources: [...netSeen],
    };
    console.log(status, u, `(${netSeen.size} network resources)`);

    const a = htmlRefs(raw, u), b = htmlRefs(rendered, u);
    for (const r of new Set([...a.refs, ...b.refs, ...netSeen])) {
      if (isPageUrl(r) && isInternal(r)) continue;
      await download(r, u);
    }
    for (const l of new Set([...a.links, ...b.links])) {
      if (!allLinks.has(l)) allLinks.set(l, new Set());
      allLinks.get(l).add(u);
      if (isPageUrl(l) && !seen.has(l)) { seen.add(l); queue.push(l); }
      else if (DOC_EXT.test(new URL(l).pathname)) { if (isInternal(l)) await download(l, u); else (report.external[l] ||= new Set()).add(u); }
      else if (!isInternal(l)) (report.external[l] ||= new Set()).add(u);
    }
  }
  // WordPress system pages that are not linked from the menus but exist on the original
  // site: the 404 page and the search results (with and without results). Saved for the
  // migration of their layout/CSS; not part of the page inventory.
  report.systemPages = {};
  for (const [slug, u] of Object.entries(SYSTEM_PAGES)) {
    const page = await ctx.newPage();
    try {
      const res = await page.goto(u, { waitUntil: 'load', timeout: 90000 });
      const raw = (await res.text()) ?? '';
      fs.writeFileSync(path.join(PAGES, slug + '.raw.html'), raw);
      fs.writeFileSync(path.join(PAGES, slug + '.rendered.html'), await page.content());
      report.systemPages[slug] = { url: u, status: res.status() };
      console.log(res.status(), u, '(system page)');
      const { refs } = htmlRefs(raw, u);
      for (const r of refs) if (!(isPageUrl(r) && isInternal(r))) await download(r, u);
    } catch (e) { report.failures.push({ url: u, error: String(e), type: 'system-page' }); }
    await page.close();
  }
  await browser.close();

  // follow CSS files for url() / @import (fonts, background images)
  for (let pass = 0; pass < 3; pass++) {
    for (const rec of Object.values(report.resources)) {
      if (rec.cssScanned || !rec.file || !/css/.test(rec.contentType || '') ) continue;
      rec.cssScanned = true;
      const css = fs.readFileSync(path.join(ROOT, rec.file), 'utf8');
      for (const u of cssUrls(css, rec.url)) await download(u, rec.url);
    }
  }

  // duplicate detection by content hash
  const byHash = {};
  for (const r of Object.values(report.resources)) if (r.sha1) (byHash[r.sha1] ||= []).push(r.url);
  report.duplicates = Object.values(byHash).filter((l) => l.length > 1);
  for (const u of commentedOriginals) if (report.resources[u]) report.resources[u].class = 'B-original-source(superseded-by-cache-bundle)';
  // transient errors that succeeded on a later attempt are not failures
  report.failures = report.failures.filter((f) => f.type === 'page' || !(report.resources[f.url]?.status >= 200 && report.resources[f.url]?.status < 400));
  report.links = Object.fromEntries([...allLinks].map(([k, v]) => [k, [...v]]));
  report.finishedAt = new Date().toISOString();

  const ser = JSON.stringify(report, (k, v) => (v instanceof Set ? [...v] : v), 2);
  fs.writeFileSync(path.join(OUT, 'report.json'), ser);
  writeMarkdown(JSON.parse(ser));
  console.log(`pages: ${Object.keys(report.pages).length}, resources: ${Object.keys(report.resources).length}, failures: ${report.failures.length}`);
}

function writeMarkdown(r) {
  const res = Object.values(r.resources);
  const byClass = {};
  for (const x of res) (byClass[x.class] ||= []).push(x);
  let md = `# Crawl report\n\nGenerated by \`npm run crawl\` on ${r.finishedAt}. Source: ${r.origin}\n\n`;
  md += `## Pages (${Object.keys(r.pages).length})\n\n| URL | Status | Title | lang |\n|---|---|---|---|\n`;
  for (const p of Object.values(r.pages)) md += `| ${p.url} | ${p.status} | ${p.title.replace(/\|/g, '\\|')} | ${p.lang} |\n`;
  md += `\n## Resources by class\n\n`;
  for (const [c, l] of Object.entries(byClass)) md += `- **${c}**: ${l.length}\n`;
  md += `\n## Redirects (${r.redirects.length})\n\n` + (r.redirects.map((x) => `- ${x.from} → ${x.to} (${x.status})`).join('\n') || '_none_') + '\n';
  md += `\n## Failures / broken resources (${r.failures.length})\n\n` + (r.failures.map((x) => `- ${x.url} — ${x.status ?? x.error} (from ${x.referrer ?? '-'})`).join('\n') || '_none_') + '\n';
  md += `\n## Duplicate resources (same bytes, different URL) (${r.duplicates.length})\n\n` + (r.duplicates.map((l) => '- ' + l.join(' = ')).join('\n') || '_none_') + '\n';
  md += `\n## External links (${Object.keys(r.external).length})\n\n` + Object.entries(r.external).map(([u, p]) => `- ${u} (${p.length} pages)`).join('\n') + '\n';
  md += `\n## All resources\n\n| URL | class | status | type | bytes |\n|---|---|---|---|---|\n`;
  for (const x of res.sort((a, b) => a.url.localeCompare(b.url))) md += `| ${x.url} | ${x.class} | ${x.status ?? ''} | ${x.contentType ?? ''} | ${x.bytes ?? ''} |\n`;
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'crawl-report.md'), md);
}

main().catch((e) => { console.error(e); process.exit(1); });
