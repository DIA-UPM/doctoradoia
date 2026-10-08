// The production build must work on its own: every request to the original WordPress
// host (and to any other third party) is blocked, and the pages must still render with
// their CSS, fonts, images, video and JavaScript behaviour.
import { test, expect, allPages, waitForImages, brokenImages, LIVE_HOST } from '../helpers/fixtures.mjs';

const pages = allPages();

test.describe('local-only mode (all external hosts blocked)', () => {
  test.beforeEach(async ({ context }) => {
    context.blocked = [];
    await context.route('**/*', (route) => {
      const host = new URL(route.request().url()).hostname;
      if (host === 'localhost' || host === '127.0.0.1') return route.continue();
      context.blocked.push(route.request().url());
      return route.abort('blockedbyclient');
    });
  });

  for (const p of pages) {
    test(`${p.lang} ${p.path} renders without the original site`, async ({ page, context }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(p.path);
      await waitForImages(page);
      // CSS applied: header layout and theme fonts
      await expect(page.locator('#masthead')).toBeVisible();
      expect(await page.locator('.main-header-menu').first().evaluate((e) => getComputedStyle(e).display)).toBe('flex');
      expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check("16px 'Syne'") && [...document.fonts].some((f) => f.status === 'loaded'); })).toBe(true);
      expect(await brokenImages(page)).toEqual([]);
      expect(errors).toEqual([]);
      // nothing tried to reach the original WordPress site
      expect(context.blocked.filter((u) => new URL(u).host === LIVE_HOST)).toEqual([]);
      // only the intentional third-party embed (Google Maps iframe) may have been blocked
      expect(context.blocked.filter((u) => !/google\.com\/maps|gstatic|googleapis/.test(u))).toEqual([]);
    });
  }

  test('interactive behaviour works offline (tabs, mobile menu, sticky header, video)', async ({ page }) => {
    await page.goto('/investigacion/');
    await page.locator('.tabTitles > li').nth(2).click();
    await expect(page.locator('.eb-tab-wrapper[data-tab-id="3"]')).toBeVisible();
    await page.mouse.wheel(0, 1500);
    await expect(page.locator('#ast-fixed-header')).toHaveClass(/ast-header-sticked/);
    await page.goto('/');
    await expect.poll(() => page.locator('.vidbg-container video').evaluate((v) => v.readyState), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#ast-mobile-header .menu-toggle').first().click();
    await expect(page.locator('#ast-mobile-popup')).toHaveClass(/active/);
  });
});
