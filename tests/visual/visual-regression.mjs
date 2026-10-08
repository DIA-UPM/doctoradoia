#!/usr/bin/env node
/**
 * Visual regression: renders the LOCAL build in exactly the same states as the live
 * baseline (tests/reference/, see capture-baseline.mjs) and compares them with pixelmatch.
 *
 * Output: tests/visual/output/{local,diff}/*.png and tests/visual/output/report.json|md
 * Usage:  npm run test:visual                 (all pages)
 *         npm run test:visual -- --only=home  (one page key)
 * Fails (exit 1) when a screenshot differs more than its threshold; every difference
 * above 0.5 % is listed in the report so it can be inspected and classified
 * (docs/visual-regression.md).
 */
import '../../scripts/lib/env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { VISUAL_TARGETS, stabilize } from '../helpers/pages.mjs';
import { captureStates } from './capture-baseline.mjs';
import { startServer } from '../../scripts/build/serve.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const REF = path.join(ROOT, 'tests', 'reference');
const OUT = path.join(ROOT, 'tests', 'visual', 'output');
const LOCAL = path.join(OUT, 'local');
const DIFF = path.join(OUT, 'diff');
const PORT = 8097;
// allowed share of differing pixels. The hero video, the Google Maps iframe and
// font anti-aliasing produce small unavoidable differences.
const EXPECTED = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'visual', 'expected-differences.json'), 'utf8')).differences;
const THRESHOLD = Number(process.env.VISUAL_THRESHOLD || 0.03);

function compare(refFile, localFile, diffFile, rects = []) {
  const a = PNG.sync.read(fs.readFileSync(refFile));
  const b = PNG.sync.read(fs.readFileSync(localFile));
  // masked areas are painted the same colour in both images
  for (const img of [a, b]) for (const r of rects) for (let y = Math.max(0, r.y); y < Math.min(img.height, r.y + r.h); y++) for (let x = Math.max(0, r.x); x < Math.min(img.width, r.x + r.w); x++) { const i = (y * img.width + x) * 4; img.data[i] = 128; img.data[i + 1] = 128; img.data[i + 2] = 128; img.data[i + 3] = 255; }
  const width = Math.min(a.width, b.width), height = Math.min(a.height, b.height);
  const crop = (img) => { if (img.width === width && img.height === height) return img; const o = new PNG({ width, height }); PNG.bitblt(img, o, 0, 0, width, height, 0, 0); return o; };
  const A = crop(a), B = crop(b);
  const diff = new PNG({ width, height });
  const n = pixelmatch(A.data, B.data, diff.data, width, height, { threshold: 0.15, includeAA: false });
  fs.writeFileSync(diffFile, PNG.sync.write(diff));
  return { ratio: n / (width * height), heightRef: a.height, heightLocal: b.height, widthRef: a.width, widthLocal: b.width };
}

/** nothing to normalise locally: the map iframe is masked on both sides (MASK_SELECTOR) */
async function normalize() {}

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  // --only=<key> re-checks one page and keeps the results of the others
  const previous = only && fs.existsSync(path.join(OUT, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'report.json'), 'utf8')).filter((r) => !only.split(',').includes(r.page)) : [];
  if (!only) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(LOCAL, { recursive: true }); fs.mkdirSync(DIFF, { recursive: true });
  const server = await startServer({ port: PORT });
  const browser = await chromium.launch();
  const refIndex = fs.existsSync(path.join(REF, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(REF, 'index.json'), 'utf8')) : [];
  const results = [];
  let lastKey = null;
  for (const { entry, vp } of VISUAL_TARGETS().filter((t) => !only || only.split(',').includes(t.entry.key))) {
    if (lastKey && lastKey !== `${entry.key}.${entry.lang}`) process.stdout.write('.');
    lastKey = `${entry.key}.${entry.lang}`;
    {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}${entry.path}`, { waitUntil: 'load' });
      await stabilize(page);
      await normalize(page);
      const masks = {};
      const files = await captureStates(page, entry, vp, LOCAL, { force: true, masks });
      for (const f of files) {
        const name = path.basename(f);
        const ref = path.join(REF, name);
        if (!fs.existsSync(ref)) { results.push({ name, missingReference: true }); continue; }
        const r = compare(ref, f, path.join(DIFF, name), masks[f] || []);
        const pass = r.ratio <= THRESHOLD && Math.abs(r.heightRef - r.heightLocal) <= Math.max(8, r.heightRef * 0.01);
        // the live capture itself was incomplete (e.g. a hot-linked image did not load): reported, not counted as a failure
        const refMissing = (refIndex.find((e) => e.key === entry.key && e.lang === entry.lang && e.viewport === vp.name)?.missingResources) || [];
        const expected = !pass && EXPECTED.find((d) => new RegExp(d.pattern).test(name));
        results.push({ name, page: entry.key, lang: entry.lang, viewport: vp.name, ...r, pass: pass || (refMissing.length || expected ? null : false), refMissing, expected: expected ? `${expected.class}: ${expected.reason}` : undefined });
      }
      await ctx.close();
    }
  }
  results.unshift(...previous);
  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  let md = `# Visual regression report\n\nThreshold: ${(THRESHOLD * 100).toFixed(1)} % differing pixels; page height may differ by at most 1 %.\n\n| Screenshot | Diff % | Height live → local | Result |\n|---|---|---|---|\n`;
  for (const r of results) md += r.missingReference ? `| ${r.name} | – | – | no reference |\n` : `| ${r.name} | ${(r.ratio * 100).toFixed(2)} | ${r.heightRef} → ${r.heightLocal} | ${r.pass ? 'pass' : r.expected ? 'expected difference (' + r.expected + ')' : r.pass === null ? 'baseline incomplete (' + r.refMissing.map((m) => m.split('/').pop()).join(', ') + ')' : '**FAIL**'} |\n`;
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  const failed = results.filter((r) => r.pass === false);
  console.log(`\n${results.length} screenshots compared, ${failed.length} above threshold, ${results.filter((r) => r.expected).length} expected differences, ${results.filter((r) => r.pass === null && !r.expected).length} with an incomplete live baseline`);
  for (const r of failed) console.log(`  ✗ ${r.name}: ${(r.ratio * 100).toFixed(2)} % (height ${r.heightRef} → ${r.heightLocal})`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
