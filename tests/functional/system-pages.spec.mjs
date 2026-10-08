// 404 page and client-side search (replacement of the WordPress search at <home>?s=).
import { test, expect, expectNoIssues as baseExpectNoIssues, readJson } from '../helpers/fixtures.mjs';

// the 404 status of the error page itself is expected (the browser logs it as a console error)
const expectNoIssues = (issues) => {
  issues.console = issues.console.filter((m) => !/status of 404/.test(m));
  issues.http = issues.http.filter((h) => !/^404 .*(no-existe|exist)/.test(h));
  baseExpectNoIssues(issues);
};

for (const lang of ['es', 'en']) {
  const sys = readJson(`data/${lang}/system.json`);
  const home = readJson(`data/${lang}/pages/home.json`).path;
  const prefix = readJson('data/site.json').languages.find((l) => l.code === lang).pathPrefix;

  test(`[${lang}] unknown URL shows the 404 page of the language`, async ({ page, issues }) => {
    const res = await page.goto(`${prefix}esta-pagina-no-existe/`);
    expect(res.status()).toBe(404);
    await expect(page).toHaveTitle(sys.notFound.title);
    await expect(page.locator('.error-404 h1.page-title')).toHaveText(sys.notFound.heading);
    await expect(page.locator('#masthead')).toBeVisible();
    expectNoIssues(issues);
  });

  test(`[${lang}] search from the 404 page lists matching pages`, async ({ page, issues }) => {
    await page.goto(`${prefix}esta-pagina-no-existe/`);
    const term = lang === 'es' ? 'tesis' : 'thesis';
    await page.locator('.error-404 .search-field').fill(term);
    await page.locator('.error-404 .search-field').press('Enter');
    await expect(page).toHaveURL(new RegExp(`\\?s=${term}$`));
    await expect(page.locator('h1.ast-archive-title')).toContainText(term);
    await expect(page).toHaveTitle(sys.searchResults.title.replace('{query}', term));
    const results = page.locator('article.ast-archive-post h2.entry-title a');
    await expect(results.first()).toBeVisible();
    // every result is a real page and contains the term
    for (const href of await results.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
      const body = await (await page.request.get(href)).text();
      expect(body.toLowerCase(), href).toContain(term);
    }
    expectNoIssues(issues);
  });

  test(`[${lang}] search without results shows the message and the form`, async ({ page }) => {
    await page.goto(`${home}?s=zqxwvut`);
    await expect(page.locator('.no-results p')).toHaveText(sys.searchResults.noResults);
    await expect(page.locator('.no-results .search-field')).toHaveValue('zqxwvut');
  });
}

test('search results match the original WordPress search (same pages, same order)', async ({ page }) => {
  // results observed on the live site on 2026-10-07 (.cache/crawl/pages/_search*.raw.html)
  await page.goto('/?s=tesis');
  await expect(page.locator('h2.entry-title a')).toHaveText(['Elaboracio?n y evaluacio?n de la Tesis Doctoral', 'Actividades Formativas', 'Información y enlaces de interés', 'Objetivos, competencias, capacidades y destrezas', 'Presentación']);
  await page.goto('/language/en/?s=thesis');
  await expect(page.locator('h2.entry-title a')).toHaveText(['Elaboration and Evaluation of the PhD Thesis', 'Training Activities', 'Information', 'Overview']);
});
