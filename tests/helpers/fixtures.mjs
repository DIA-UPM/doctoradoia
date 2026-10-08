// Shared helpers for the functional tests.
import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect } from '@playwright/test';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
export const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
export const LIVE_HOST = 'doctoradoia.dia.fi.upm.es';

/** requests that may fail without being a defect of the static site */
const BENIGN = [
  /google\.com\/maps|gstatic\.com|googleapis\.com\/maps/, // third-party map embed
];

/**
 * `page` fixture that records console errors, JS exceptions, failed requests,
 * HTTP errors and any request to the original WordPress host.
 */
export const test = base.extend({
  issues: async ({ page }, use) => {
    const issues = { console: [], exceptions: [], failed: [], http: [], liveHost: [] };
    page.on('console', (m) => { if (m.type() === 'error') issues.console.push(m.text()); });
    page.on('pageerror', (e) => issues.exceptions.push(e.message));
    page.on('requestfailed', (r) => {
      const err = r.failure()?.errorText || '';
      // media requests are routinely cancelled by the browser once enough data is buffered
      if (/ERR_ABORTED/.test(err) && ['media', 'other'].includes(r.resourceType())) return;
      if (BENIGN.some((b) => b.test(r.url()))) return;
      issues.failed.push(`${r.url()} (${err})`);
    });
    page.on('response', (r) => { if (r.status() >= 400 && !BENIGN.some((b) => b.test(r.url()))) issues.http.push(`${r.status()} ${r.url()}`); });
    page.on('request', (r) => { if (new URL(r.url()).host === LIVE_HOST) issues.liveHost.push(r.url()); });
    await use(issues);
  },
});
export { expect };

export function expectNoIssues(issues) {
  expect(issues.exceptions, 'JavaScript exceptions').toEqual([]);
  expect(issues.console, 'console errors').toEqual([]);
  expect(issues.failed, 'failed requests').toEqual([]);
  expect(issues.http, 'HTTP errors').toEqual([]);
  expect(issues.liveHost, 'requests to the original WordPress site').toEqual([]);
}

/** all pages of the site from the JSON content */
export function allPages() {
  const site = readJson('data/site.json');
  return site.languages.flatMap(({ code }) =>
    fs.readdirSync(path.join(ROOT, 'data', code, 'pages')).filter((f) => f.endsWith('.json')).map((f) => ({ lang: code, key: f.replace('.json', ''), ...readJson(`data/${code}/pages/${f}`) })));
}

export async function waitForImages(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000); }))));
  });
}

/** images that failed to load (excluding intentionally external ones) */
export async function brokenImages(page) {
  return page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && !/^data:/.test(i.src)).map((i) => i.src));
}

export async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
