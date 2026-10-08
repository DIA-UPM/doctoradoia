#!/usr/bin/env node
/**
 * ONE-OFF MIGRATION TOOL: copies the SEO metadata of every crawled page (title, robots,
 * OpenGraph, dates, breadcrumb, WordPress id) into data/<lang>/pages/<key>.json,
 * keeping any "content" already present in those files.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { PAGES } from '../../tests/helpers/pages.mjs';
import { localUrl, saveAssetRegistry } from './urls.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const report = JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/crawl/report.json'), 'utf8'));

for (const pg of PAGES) {
  for (const lang of ['es', 'en']) {
    const p = pg[lang];
    const rec = Object.values(report.pages).find((x) => new URL(x.url).pathname === p);
    const $ = cheerio.load(fs.readFileSync(path.join(ROOT, '.cache/crawl/pages', rec.slug + '.raw.html'), 'utf8'));
    const m = (prop) => $(`meta[property="${prop}"]`).attr('content') || null;
    const graph = JSON.parse($('script.yoast-schema-graph').html() || '{"@graph":[]}')['@graph'];
    const webpage = graph.find((g) => g['@type'] === 'WebPage' || (Array.isArray(g['@type']) && g['@type'].includes('WebPage'))) || {};
    const crumbs = graph.find((g) => g['@type'] === 'BreadcrumbList')?.itemListElement || [];
    const body = $('body').attr('class') || '';
    const wordpressId = Number(body.match(/page-id-(\d+)/)[1]);
    const meta = {
      title: $('title').text(),
      description: $('meta[name="description"]').attr('content') || undefined,
      robots: $('meta[name="robots"]').attr('content') || undefined,
      ogType: m('og:type') || undefined,
      ogImage: m('og:image') ? { src: localUrl(m('og:image')), width: Number(m('og:image:width')) || undefined, height: Number(m('og:image:height')) || undefined, type: m('og:image:type') || undefined } : undefined,
      published: webpage.datePublished || undefined,
      modified: m('article:modified_time') || webpage.dateModified || undefined,
      breadcrumb: crumbs.at(-1)?.name || undefined,
    };
    const f = path.join(ROOT, 'data', lang, 'pages', `${pg.key}.json`);
    const existing = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    const extras = body.split(/\s+/).filter((c) => ['ast-normal-title-enabled'].includes(c)).join(' ');
    const out = {
      path: p,
      sourceUrl: rec.url,
      wordpressId,
      ...(body.split(/\s+/).includes('home') ? { isHome: true } : {}),
      ...(extras ? { bodyClass: extras } : {}),
      ...($('h1.entry-title').length ? { entryTitle: $('h1.entry-title').text().trim() } : {}),
      ...(existing.scripts ? { scripts: existing.scripts } : {}),
      meta: JSON.parse(JSON.stringify(meta)),
      content: existing.content ?? {},
    };
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(out, null, 2) + '\n');
  }
}
saveAssetRegistry();
console.log('metadata written for', PAGES.length * 2, 'pages');
