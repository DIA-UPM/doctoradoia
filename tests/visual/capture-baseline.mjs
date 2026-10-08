#!/usr/bin/env node
/**
 * Captures the visual baseline of the LIVE website into tests/reference/.
 * Usage: npm run baseline            (skips screenshots that already exist)
 *        npm run baseline -- --force (recaptures everything)
 *
 * The same capture routine (captureStates) is used by the visual regression test
 * against the local build, so both sides are rendered in identical states.
 */
import '../../scripts/lib/env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { VISUAL_TARGETS, LIVE_ORIGIN, shotName, stabilize } from '../helpers/pages.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');

/** Interactive states captured in addition to the full page. */
// areas excluded from the pixel comparison: third-party Google Maps iframe (its tiles and
// info card change between loads)
export const MASK_SELECTOR = '#block-64 iframe';

export async function captureStates(page, entry, vp, outDir, { force = false, masks = null } = {}) {
  const files = [];
  const shot = async (state, fn, opts = {}) => {
    const file = path.join(outDir, shotName(entry.key, entry.lang, vp.name, state));
    if (!force && fs.existsSync(file)) { files.push(file); return; }
    await fn?.();
    await page.screenshot({ path: file, fullPage: opts.fullPage ?? false, animations: 'disabled' });
    if (masks) masks[file] = await page.evaluate(({ sel, full }) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.floor(r.x + (full ? window.scrollX : 0)), y: Math.floor(r.y + (full ? window.scrollY : 0)), w: Math.ceil(r.width), h: Math.ceil(r.height) }; }), { sel: MASK_SELECTOR, full: opts.fullPage ?? false });
    files.push(file);
  };
  await shot('full', null, { fullPage: true });
  await shot('top', null);
  const desktop = vp.width > 921; // Astra switches to the mobile header at 921px
  if (desktop && vp.name === '1440') {
    // dropdown open (hover "Aspirantes")
    await shot('dropdown', async () => {
      await page.hover('#ast-desktop-header .menu-item-has-children > a');
      await page.waitForTimeout(500);
    });
    await page.mouse.move(0, 0);
    // sticky header after scrolling
    await shot('sticky', async () => {
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(800);
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
  }
  if (!desktop && vp.name === '390') {
    await shot('menu-open', async () => {
      await page.click('#ast-mobile-header .menu-toggle');
      await page.waitForTimeout(800);
    });
    await page.keyboard.press('Escape').catch(() => {});
  }
  if (vp.name === '1440') {
    // second tab of the first tab group, if the page has tabs
    const tabs = page.locator('.eb-tabs-nav li:visible');
    if ((await tabs.count()) > 1) {
      await shot('tab2', async () => {
        await page.reload({ waitUntil: 'load' });
        await stabilize(page);
        const t = tabs.nth(1);
        await t.scrollIntoViewIfNeeded();
        await t.click();
        await page.waitForTimeout(600);
      }, { fullPage: true });
    }
  }
  return files;
}

// index.json is updated after every capture, so an interrupted run keeps what it captured;
// entries of pages not captured in this run (--only) are kept
function saveIndex(out, index) {
  const indexFile = path.join(out, 'index.json');
  const old = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : [];
  const key = (e) => `${e.key}.${e.lang}.${e.viewport}`;
  const merged = [...old.filter((e) => !index.some((n) => key(n) === key(e))), ...index];
  fs.writeFileSync(indexFile, JSON.stringify(merged, null, 2));
}

async function main() {
  const force = process.argv.includes('--force');
  const out = path.join(ROOT, 'tests', 'reference');
  fs.mkdirSync(out, { recursive: true });
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const browser = await chromium.launch();
  const index = [];
  for (const { entry, vp } of VISUAL_TARGETS().filter((t) => !only || only.split(',').includes(t.entry.key))) {
    {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const url = LIVE_ORIGIN + entry.path;
      // The source server occasionally times out and the site hot-links images from other
      // UPM hosts that are intermittently unavailable: a capture is only accepted when every
      // image, font, stylesheet and script loaded; otherwise it is retried.
      const failed = [];
      page.on('requestfailed', (r) => { if (['image', 'font', 'stylesheet', 'script'].includes(r.resourceType())) failed.push(r.url()); });
      page.on('response', (r) => { if (r.status() >= 400 && ['image', 'font', 'stylesheet', 'script'].includes(r.request().resourceType())) failed.push(`${r.status()} ${r.url()}`); });
      let incomplete = [];
      for (let attempt = 1; ; attempt++) {
        failed.length = 0;
        try {
          await page.goto(url, { waitUntil: 'load', timeout: 90000 });
          await stabilize(page);
          const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && !/^data:/.test(i.src)).map((i) => i.src));
          incomplete = [...new Set([...failed, ...broken])].filter((u) => !/google\.com\/maps|gstatic|googleapis\.com\/maps/.test(u));
          if (!incomplete.length || attempt >= 4) break;
          console.warn(`retry ${attempt} ${url}: incomplete resources ${incomplete.join(', ')}`);
        } catch (e) {
          if (attempt >= 4) { incomplete = ['PAGE NOT LOADED: ' + e.message.split('\n')[0]]; break; }
          console.warn(`retry ${attempt} ${url}: ${e.message.split('\n')[0]}`);
        }
        await new Promise((r) => setTimeout(r, 5000 * attempt));
      }
      if (incomplete.some((m) => m.startsWith('PAGE NOT LOADED'))) { console.warn(`  ! ${url} skipped: ${incomplete[0]}`); index.push({ ...entry, url, viewport: vp.name, files: [], missingResources: incomplete }); await ctx.close(); continue; }
      if (incomplete.length) console.warn(`  ! ${url} captured with missing resources: ${incomplete.join(', ')}`);
      const files = await captureStates(page, entry, vp, out, { force });
      index.push({ ...entry, url, viewport: vp.name, files: files.map((f) => path.basename(f)), missingResources: incomplete });
      saveIndex(out, index);
      console.log(entry.key, entry.lang, vp.name, files.length);
      await ctx.close();
      await new Promise((r) => setTimeout(r, 300)); // politeness
    }
  }
  await browser.close();
  saveIndex(out, index);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main().catch((e) => { console.error(e); process.exit(1); });
