// Global navigation: desktop menu + dropdown, sticky header, mobile drawer, logo, language switch.
import { test, expect, expectNoIssues, readJson } from '../helpers/fixtures.mjs';

const nav = readJson('data/navigation.json');
const pathOf = (lang, key) => readJson(`data/${lang}/pages/${key}.json`).path;

for (const lang of ['es', 'en']) {
  const home = pathOf(lang, 'home');

  test(`[${lang}] desktop menu links lead to the right pages`, async ({ page, issues }) => {
    await page.goto(home);
    const menu = page.locator('#ast-hf-menu-1');
    for (const item of nav[lang].items) {
      const targets = item.children ? item.children : [item];
      for (const t of targets) {
        const link = menu.locator(`a.menu-link[href="${pathOf(lang, t.page)}"]`).first();
        await expect(link, `menu link to ${t.page}`).toHaveCount(1);
        await expect(link).toContainText(t.label);
        const res = await page.request.get(pathOf(lang, t.page));
        expect(res.status(), `${t.page} responds`).toBe(200);
      }
    }
    expectNoIssues(issues);
  });

  test(`[${lang}] dropdown opens on hover and on keyboard focus`, async ({ page }) => {
    await page.goto(home);
    const parent = page.locator('#ast-desktop-header #ast-hf-menu-1 > li.menu-item-has-children').first();
    const sub = parent.locator(':scope > .sub-menu');
    await expect(sub).toBeHidden();
    await parent.hover();
    await expect(sub).toBeVisible();
    await page.mouse.move(5, 600);
    await expect(sub).toBeHidden();
    await parent.locator(':scope > a').focus();
    await expect(parent).toHaveClass(/\bfocus\b/);
    await expect(sub).toBeVisible();
  });

  test(`[${lang}] current page and its parent are marked in the menu`, async ({ page }) => {
    await page.goto(pathOf(lang, 'investigacion'));
    await expect(page.locator(`#ast-hf-menu-1 a[href="${pathOf(lang, 'investigacion')}"]`).locator('xpath=..')).toHaveClass(/current-menu-item/);
    await expect(page.locator('#ast-hf-menu-1 > li.menu-item-has-children')).toHaveClass(/current-menu-ancestor/);
    await expect(page.locator(`#colophon a[href="${pathOf(lang, 'investigacion')}"]`)).toHaveAttribute('aria-current', 'page');
  });

  test(`[${lang}] logo links to the home page`, async ({ page }) => {
    await page.goto(pathOf(lang, 'contacto'));
    await page.locator('#ast-desktop-header .custom-logo-link').first().click();
    await expect(page).toHaveURL(new RegExp(`${home.replace(/\//g, '\\/')}$`));
  });

  test(`[${lang}] language switch goes to the translation of the current page`, async ({ page }) => {
    const other = lang === 'es' ? 'en' : 'es';
    for (const key of ['home', 'investigacion', 'formacion']) {
      await page.goto(pathOf(lang, key));
      await expect(page.locator('html')).toHaveAttribute('lang', lang === 'es' ? 'es-ES' : 'en-US');
      await page.locator('#masthead > #ast-desktop-header .lang-item a').click();
      await expect(page).toHaveURL(new RegExp(pathOf(other, key).replace(/\//g, '\\/') + '$'));
      await expect(page.locator('html')).toHaveAttribute('lang', other === 'es' ? 'es-ES' : 'en-US');
    }
  });

  test(`[${lang}] sticky header appears after scrolling (desktop) and scroll-to-top works`, async ({ page }) => {
    await page.goto(home);
    const fixed = page.locator('#ast-fixed-header');
    await expect(fixed).toHaveCSS('visibility', 'hidden');
    await page.mouse.wheel(0, 1200);
    await expect(fixed).toHaveClass(/ast-header-sticked/);
    await expect(fixed).toHaveCSS('visibility', 'visible');
    const toTop = page.locator('#ast-scroll-top');
    await expect(toTop).toBeVisible();
    await toTop.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(fixed).toHaveCSS('visibility', 'hidden');
  });

  test(`[${lang}] mobile drawer: open, submenu, close (button, overlay, Escape)`, async ({ page, issues }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(home);
    await expect(page.locator('#ast-desktop-header').first()).toBeHidden();
    const toggle = page.locator('#ast-mobile-header .menu-toggle').first();
    const drawer = page.locator('#ast-mobile-popup');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(drawer).toHaveClass(/active/);
    await expect(page.locator('#ast-mobile-popup .ast-mobile-popup-content')).toBeVisible();
    await expect(page.locator('#menu-toggle-close')).toBeFocused();
    // submenu
    const parent = drawer.locator('#ast-hf-mobile-menu > li.menu-item-has-children');
    const sub = parent.locator(':scope > .sub-menu');
    await expect(sub).toBeHidden();
    await parent.locator(':scope > .ast-menu-toggle').click();
    await expect(sub).toBeVisible();
    await expect(parent.locator(':scope > .ast-menu-toggle')).toHaveAttribute('aria-expanded', 'true');
    // close with the button
    await page.locator('#menu-toggle-close').click();
    await expect(drawer).not.toHaveClass(/active/);
    // close with Escape
    await toggle.click();
    await expect(drawer).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(drawer).not.toHaveClass(/active/);
    // a link in the drawer navigates
    await toggle.click();
    await drawer.locator(`#ast-hf-mobile-menu a[href="${pathOf(lang, 'contacto')}"]`).click();
    await expect(page).toHaveURL(new RegExp(pathOf(lang, 'contacto').replace(/\//g, '\\/') + '$'));
    expectNoIssues(issues);
  });

  test(`[${lang}] skip link moves focus to the content`, async ({ page }) => {
    await page.goto(home);
    await page.keyboard.press('Tab');
    const skip = page.locator('a.skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toHaveAttribute('href', '#content');
  });
}
