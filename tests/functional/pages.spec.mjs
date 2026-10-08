// Every page: loads, SEO metadata, accessibility basics, images, network/console health,
// responsive overflow, and text parity with the snapshot of the original site.
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { test, expect, expectNoIssues, allPages, readJson, waitForImages, brokenImages, horizontalOverflow, ROOT } from '../helpers/fixtures.mjs';

const site = readJson('data/site.json');
const pages = allPages();
const WIDTHS = [390, 768, 1024, 1440, 1920];
const crawl = fs.existsSync(path.join(ROOT, '.cache/crawl/report.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/crawl/report.json'), 'utf8')) : null;
const norm = (s) => s.replace(/\s+/g, '').normalize('NFC');

for (const p of pages) {
  test.describe(`${p.lang} ${p.path}`, () => {
    test('loads without errors, metadata and accessibility basics', async ({ page, issues }) => {
      const res = await page.goto(p.path);
      expect(res.status()).toBe(200);
      await expect(page).toHaveTitle(p.meta.title);
      const langInfo = site.languages.find((l) => l.code === p.lang);
      await expect(page.locator('html')).toHaveAttribute('lang', langInfo.htmlLang);
      if (p.meta.robots) await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', p.meta.robots);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', p.meta.title);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', site.siteUrl + p.path);
      await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', site.favicon);
      // hreflang alternates for every translation
      for (const l of site.languages) {
        const t = pages.find((x) => x.lang === l.code && x.key === p.key);
        if (t) await expect(page.locator(`link[rel="alternate"][hreflang="${l.hreflang}"]`)).toHaveAttribute('href', site.siteUrl + t.path);
      }
      expect(JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())['@graph'][0].url).toBe(site.siteUrl + p.path);
      // headings: the site title is the H1 of the header (as on the original); the page has visible headings
      await expect(page.locator('#masthead > #ast-desktop-header h1')).toHaveCount(1);
      expect(await page.locator('.entry-content :is(h1,h2,h3)').count()).toBeGreaterThan(0);
      // images: alt attribute present, all load
      expect(await page.locator('img:not([alt])').count(), 'images without alt attribute').toBe(0);
      await waitForImages(page);
      expect(await brokenImages(page)).toEqual([]);
      // fonts actually used are loaded locally
      expect(await page.evaluate(async () => { await document.fonts.ready; const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')); return ['Syne', 'Noto Sans Hanunoo'].every((n) => loaded.includes(n)); }), 'Syne and Noto Sans Hanunoo loaded').toBe(true);
      expectNoIssues(issues);
    });

    test('no horizontal overflow at 390/768/1024/1440/1920 px', async ({ page }) => {
      await page.goto(p.path);
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(150);
        expect(await horizontalOverflow(page), `overflow at ${w}px`).toBeLessThanOrEqual(0);
      }
    });

    test('documents and internal files linked from the page are served', async ({ page }) => {
      await page.goto(p.path);
      const hrefs = await page.locator('.entry-content a[href^="/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
      for (const h of hrefs) {
        const r = await page.request.get(h);
        expect(r.status(), h).toBe(200);
        if (/\.pdf$/i.test(h)) expect(r.headers()['content-type']).toContain('application/pdf');
      }
    });

    test('text content matches the original page (crawl snapshot)', async ({ page }) => {
      test.skip(!crawl, 'no crawl snapshot (.cache/crawl) — run npm run crawl');
      const rec = Object.values(crawl.pages).find((x) => new URL(x.url).pathname === p.path);
      const $ = cheerio.load(fs.readFileSync(path.join(ROOT, '.cache/crawl/pages', rec.slug + '.raw.html'), 'utf8'));
      $('.entry-content script, .entry-content style').remove();
      const original = norm($('.entry-content').text());
      await page.goto(p.path);
      const local = norm(await page.locator('.entry-content').evaluate((e) => e.textContent));
      expect(local).toBe(original);
      // header/footer menus and footer texts
      const origFooter = norm($('#colophon').text()).replace(/Copyright©\d{4}/, '');
      const localFooter = norm(await page.locator('#colophon').evaluate((e) => e.textContent)).replace(/Copyright©\d{4}/, '');
      expect(localFooter).toBe(origFooter);
    });
  });
}

test('robots.txt and sitemaps list every page with its original URL', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain(`Sitemap: ${site.siteUrl}/sitemap_index.xml`);
  const sm = await (await request.get('/page-sitemap.xml')).text();
  for (const p of pages) expect(sm).toContain(`<loc>${site.siteUrl}${p.path}</loc>`);
});

test('unknown URLs return 404', async ({ request }) => {
  expect((await request.get('/this-page-does-not-exist/')).status()).toBe(404);
});
