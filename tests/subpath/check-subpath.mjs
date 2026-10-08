#!/usr/bin/env node
/**
 * Sub-path deployment test (GitHub Pages project site: https://<user>.github.io/<repo>/).
 * Builds the site with BASE_PATH=/doctoradoia-test/ into .cache/subpath/doctoradoia-test/,
 * serves .cache/subpath/ and, with every external host blocked, checks for every page:
 * HTTP 200, no failed requests, no console errors, no broken images, fonts loaded, every
 * internal link/asset inside the sub-path and reachable; plus menu, tabs, language switch,
 * search, 404 and the /language/en/ redirect.
 * Usage: npm run test:subpath
 */
import '../../scripts/lib/env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { build } from '../../scripts/build/build.mjs';
import { startServer } from '../../scripts/build/serve.mjs';
import { loadData, ROOT } from '../../scripts/build/data.mjs';

const BASE = '/doctoradoia-test/';
const ROOTDIR = path.join(ROOT, '.cache', 'subpath');
const OUT = path.join(ROOTDIR, BASE);
const PORT = 8088;
const origin = `http://localhost:${PORT}`;
const problems = [];
const fail = (m) => { problems.push(m); console.log('  ✗ ' + m); };

fs.rmSync(ROOTDIR, { recursive: true, force: true });
await build({ outDir: OUT, base: BASE, quiet: true });
// GitHub Pages serves <repo>/404.html for unknown URLs below the repository path
const server = await startServer({ port: PORT, dir: ROOTDIR, onRequest(req, res) {
  const u = new URL(req.url, origin).pathname;
  const f = path.join(ROOTDIR, decodeURIComponent(u));
  if (u.startsWith(BASE) && !fs.existsSync(f) && !fs.existsSync(path.join(f, 'index.html'))) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(OUT, '404.html'))); return true;
  }
  return false;
} });

const data = loadData();
const pages = Object.values(data.langs).flatMap((l) => Object.values(l.pages));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === 'localhost' ? r.continue() : r.abort('blockedbyclient')));
const checkedTargets = new Set();

for (const p of pages) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('requestfailed', (r) => { const u = r.url(); if (new URL(u).hostname === 'localhost' && !/ERR_ABORTED/.test(r.failure()?.errorText || '')) errs.push('failed ' + u); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
  const url = origin + BASE.slice(0, -1) + p.path;
  const res = await page.goto(url);
  if (res.status() !== 200) fail(`${p.path}: HTTP ${res.status()}`);
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 20)); } });
  await page.waitForTimeout(300);
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
  if (broken.length) fail(`${p.path}: broken images ${broken.join(', ')}`);
  const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check("16px 'Syne'"); });
  if (!fontsOk) fail(`${p.path}: fonts not loaded`);
  // every root-relative reference must stay inside the sub-path
  const refs = await page.evaluate(() => [...document.querySelectorAll('[href],[src]')].map((e) => e.getAttribute('href') || e.getAttribute('src')).filter((u) => u && u.startsWith('/') && !u.startsWith('//')));
  for (const r of refs) {
    if (!r.startsWith('/doctoradoia-test/')) { fail(`${p.path}: reference outside the base path: ${r}`); continue; }
    const target = r.split('#')[0];
    if (checkedTargets.has(target)) continue;
    checkedTargets.add(target);
    const rr = await page.request.get(origin + target);
    if (rr.status() !== 200) fail(`${p.path}: ${target} → HTTP ${rr.status()}`);
  }
  for (const e of errs) fail(`${p.path}: ${e}`);
  await page.close();
  process.stdout.write('.');
}

// interactions
const page = await ctx.newPage();
await page.goto(`${origin}${BASE}investigacion/`);
await page.locator('.tabTitles > li').nth(2).click();
await page.locator('.eb-tab-wrapper[data-tab-id="3"]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => fail('tabs do not switch'));
await page.locator('#masthead > #ast-desktop-header .lang-item a').click();
if (!page.url().endsWith(`${BASE}language/en/groups-and-lines-of-research/`)) fail('language switch: ' + page.url());
await page.goto(`${origin}${BASE}?s=tesis`);
await page.waitForSelector('h2.entry-title a', { timeout: 5000 }).catch(() => fail('search shows no results'));
const firstHref = await page.locator('h2.entry-title a').first().getAttribute('href').catch(() => '');
if (!firstHref?.startsWith(BASE)) fail('search result link outside base path: ' + firstHref);
const r404 = await page.goto(`${origin}${BASE}no-existe/`);
if (r404.status() !== 404 || !(await page.locator('.error-404').count())) fail('404 page not served');
await page.goto(`${origin}${BASE}language/en/`);
await page.waitForURL(`**${BASE}language/en/overview/`, { timeout: 5000 }).catch(() => fail('/language/en/ redirect: ' + page.url()));
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${origin}${BASE}`);
await page.locator('#ast-mobile-header .menu-toggle').first().click();
await page.locator(`#ast-hf-mobile-menu a[href="${BASE}contacto/"]`).click();
if (!page.url().endsWith(`${BASE}contacto/`)) fail('mobile menu link: ' + page.url());

await browser.close(); server.close();
console.log(`\n${problems.length ? '✗' : '✓'} sub-path build (${BASE}): ${pages.length} pages, ${checkedTargets.size} internal URLs checked, ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
