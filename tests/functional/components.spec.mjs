// Homepage sections, repeated content types (research lines, people, training activities)
// and interactive components (tabs, entrance animations, background video).
import { test, expect, expectNoIssues, readJson, waitForImages, brokenImages } from '../helpers/fixtures.mjs';

const people = Object.fromEntries(readJson('data/people.json').people.map((p) => [p.id, p]));

for (const lang of ['es', 'en']) {
  const pg = (key) => readJson(`data/${lang}/pages/${key}.json`);

  test(`[${lang}] homepage: main sections are rendered from the JSON`, async ({ page, issues }) => {
    const home = pg('home');
    const c = home.content;
    await page.goto(home.path);
    const text = (sel) => page.locator(sel).first();
    await expect(text('#portada-doctorado, #phd-overview')).toBeVisible();
    for (const s of [c.hero.programme.title, c.purpose.heading.title, c.strengths.heading.title, c.history.heading.title, c.researchIntro.heading.title]) {
      await expect(page.locator('.entry-content').getByText(s.replace(/<[^>]+>/g, ''), { exact: false }).first()).toBeAttached();
    }
    await expect(page.locator('.wp-block-essential-blocks-infobox')).toHaveCount(c.strengths.items.length);
    await expect(page.locator('.eb-feature-list-item')).toHaveCount(c.purpose.items.length);
    await waitForImages(page);
    expect(await brokenImages(page)).toEqual([]);
    expectNoIssues(issues);
  });

  test(`[${lang}] homepage: background video initialises (desktop) and poster/video behaviour`, async ({ page }) => {
    const home = pg('home');
    await page.goto(home.path);
    const video = page.locator('.vidbg-container video');
    await expect(video).toHaveCount(1);
    await expect(video).toHaveJSProperty('muted', true);
    await expect.poll(() => video.evaluate((v) => v.readyState), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => video.evaluate((v) => getComputedStyle(v).opacity)).toBe('1');
  });

  test(`[${lang}] entrance animations start when elements scroll into view`, async ({ page }) => {
    await page.goto(pg('home').path);
    const pending = await page.locator('.eb___animated').count();
    expect(pending).toBeGreaterThan(0);
    for (let y = 0; y < 8000; y += 400) { await page.mouse.wheel(0, 400); await page.waitForTimeout(40); }
    await expect.poll(() => page.locator('.eb__animated').count()).toBeGreaterThan(0);
  });

  test(`[${lang}] research lines: one tab per JSON record, professors from people.json`, async ({ page, issues }) => {
    const lines = readJson(`data/${lang}/research-lines.json`).lines;
    await page.goto(pg('investigacion').path);
    const tabs = page.locator('.tabTitles > li');
    await expect(tabs).toHaveCount(lines.length);
    for (let i = 0; i < lines.length; i++) {
      await tabs.nth(i).click();
      const panel = page.locator(`.eb-tab-wrapper[data-tab-id="${i + 1}"]`);
      await expect(panel).toBeVisible();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
      for (const id of lines[i].professors) {
        const p = people[id];
        await expect(panel.locator(`a[href="${p.portalUrl}"]`, { hasText: p.name })).toBeVisible();
        if (p.contactUrl) await expect(panel.locator(`a[href="${p.contactUrl}"]`)).toHaveCount(1);
      }
      await expect(panel.locator('ul.wp-block-list').first().locator('li')).toHaveCount(lines[i].topics.length);
      // other panels hidden
      expect(await page.locator('.eb-tab-wrapper.active').count()).toBe(1);
    }
    expectNoIssues(issues);
  });

  test(`[${lang}] training activities: tabs, tables and schedule come from the JSON`, async ({ page }) => {
    const { activities } = readJson(`data/${lang}/training-activities.json`);
    const schedule = pg('formacion').content.schedule;
    await page.goto(pg('formacion').path);
    const tabs = page.locator('.eb-advanced-tabs-wrapper .tabTitles > li');
    await expect(tabs).toHaveCount(activities.length);
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      await tabs.nth(i).click();
      const table = page.locator(`#tablepress-${a.tableId}`);
      await expect(table).toBeVisible();
      await expect(table.locator('tr')).toHaveCount(1 + a.details.reduce((n, d) => n + d.values.length, 0));
      await expect(table.locator('tr.row-1 td')).toHaveText(a.title.replace(/<[^>]+>/g, ''));
    }
    const sched = page.locator(`#tablepress-${schedule.tableId}`);
    await expect(sched.locator('tbody tr')).toHaveCount(schedule.rows.length);
    await expect(sched.locator('thead th')).toHaveCount(schedule.columns.length);
  });

  test(`[${lang}] tabs: click and keyboard switch panels`, async ({ page }) => {
    await page.goto(pg('tesis').path);
    const tabs = page.locator('.tabTitles > li');
    const n = await tabs.count();
    expect(n).toBeGreaterThan(1);
    await expect(page.locator('.eb-tab-wrapper[data-tab-id="1"]')).toBeVisible();
    await expect(page.locator('.eb-tab-wrapper[data-tab-id="2"]')).toBeHidden();
    await tabs.nth(1).click();
    await expect(page.locator('.eb-tab-wrapper[data-tab-id="2"]')).toBeVisible();
    await expect(page.locator('.eb-tab-wrapper[data-tab-id="1"]')).toBeHidden();
    await tabs.nth(1).focus();
    await page.keyboard.press('ArrowDown');
    await expect(tabs.nth(2)).toBeFocused();
    await expect(page.locator('.eb-tab-wrapper[data-tab-id="3"]')).toBeVisible();
  });

  test(`[${lang}] content stays readable without JavaScript`, async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(pg('investigacion').path);
    // every tab panel is present and visible: the panels are only hidden by tabs.js
    const lines = readJson(`data/${lang}/research-lines.json`).lines;
    for (let i = 1; i <= lines.length; i++) await expect(page.locator(`.eb-tab-wrapper[data-tab-id="${i}"]`)).toBeVisible();
    await page.goto(pg('home').path);
    await expect(page.locator('.wp-block-essential-blocks-infobox').first()).toBeVisible();
    await ctx.close();
  });
}
