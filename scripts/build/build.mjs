#!/usr/bin/env node
/**
 * Static site build:  data/*.json  →  Nunjucks templates (src/templates)  →  dist/
 *
 *   1. validates the JSON content (scripts/validation/validate.mjs) and stops on errors
 *   2. copies public/ (images, fonts, documents) and src/css, src/js to dist/
 *   3. renders every page of every language to dist/<page path>/index.html
 *   4. writes robots.txt and the XML sitemaps (same URLs as the original site)
 *
 * Usage: npm run build            (production build into dist/)
 *        BASE_PATH=/repo/ npm run build   (site served under a sub-path, e.g. GitHub Pages project site)
 *        SITE_URL=https://example.org npm run build   (public origin for canonical/OpenGraph/sitemaps)
 *        node scripts/build/build.mjs --dev   (adds the live-reload snippet; used by npm run dev)
 */
import fs from 'node:fs';
import path from 'node:path';
import nunjucks from 'nunjucks';
import * as cheerio from 'cheerio';
import { loadData, ROOT } from './data.mjs';
import { buildMenu } from './navigation.mjs';
import { validate } from '../validation/validate.mjs';
import { normalizeBase, rebaseDir } from './base-path.mjs';

const DEFAULT_DIST = path.join(ROOT, 'dist');

// classes that every page body had on the original site (Astra theme options)
const BODY_CLASSES = 'ehf-template-astra ehf-stylesheet-astra-child ast-desktop ast-plain-container ast-no-sidebar astra-4.8.6 ast-single-post ast-replace-site-logo-transparent ast-inherit-site-logo-transparent ast-theme-transparent-header ast-hfb-header ast-full-width-layout ast-sticky-main-shrink ast-sticky-below-shrink ast-sticky-header-shrink ast-inherit-site-logo-sticky ast-primary-sticky-enabled';
// body classes of the WordPress 404 and search-results templates (opaque header, boxed content)
const NOT_FOUND_BODY_CLASSES = 'error404 ehf-template-astra ehf-stylesheet-astra-child ast-desktop ast-separate-container ast-two-container ast-no-sidebar astra-4.8.6 ast-replace-site-logo-transparent ast-inherit-site-logo-transparent ast-hfb-header ast-full-width-layout ast-sticky-main-shrink ast-sticky-below-shrink ast-sticky-header-shrink ast-inherit-site-logo-sticky ast-primary-sticky-enabled';
const SEARCH_BODY_CLASSES = 'search search-results ehf-template-astra ehf-stylesheet-astra-child ast-desktop ast-separate-container ast-two-container ast-no-sidebar astra-4.8.6 ast-replace-site-logo-transparent ast-inherit-site-logo-transparent ast-hfb-header ast-blog-grid-1 ast-blog-layout-1 ast-pagination-default ast-full-width-layout ast-sticky-main-shrink ast-sticky-below-shrink ast-sticky-header-shrink ast-inherit-site-logo-sticky ast-primary-sticky-enabled';
const BASE_CSS = ['fonts', 'variables', 'theme', 'blocks', 'custom', 'static'].map((n) => `/assets/css/${n}.css`);

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

export async function build({ dev = false, quiet = false, outDir = DEFAULT_DIST, base = process.env.BASE_PATH, siteUrl = process.env.SITE_URL } = {}) {
  const DIST = outDir;
  base = normalizeBase(base);
  const t0 = Date.now();
  const data = loadData();
  const problems = validate(data);
  if (problems.length) {
    const err = new Error(`Content validation failed (${problems.length} problem${problems.length > 1 ? 's' : ''}):\n` + problems.map((p) => '  ✗ ' + p).join('\n'));
    err.validation = true;
    throw err;
  }
  const { site, langs } = data;
  if (siteUrl) site.siteUrl = siteUrl.replace(/\/+$/, '');

  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'public'), DIST);
  copyDir(path.join(ROOT, 'src', 'css'), path.join(DIST, 'assets', 'css'));
  copyDir(path.join(ROOT, 'src', 'js'), path.join(DIST, 'assets', 'js'));

  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(ROOT, 'src', 'templates'), { noCache: true }), { autoescape: true, throwOnUndefined: false, trimBlocks: false });
  const year = new Date().getFullYear();
  const languages = site.languages;
  const sitemap = [];
  let count = 0;

  // context shared by every template of a language
  const ctxFor = (lang, page, key) => {
    const homePath = langs[lang].pages.home.path;
    const sys = langs[lang].collections.system || {};
    return {
      page, lang, site, year,
      langInfo: languages.find((l) => l.code === lang),
      siteName: site.siteName[lang],
      homeUrl: homePath,
      otherLanguages: languages.filter((l) => l.code !== lang),
      menu: buildMenu(data, lang, key),
      collections: langs[lang].collections,
      shared: data.shared,
      peopleById: Object.fromEntries((data.shared.people?.people || []).map((p) => [p.id, p])),
      scripts: ['/assets/js/header.js', '/assets/js/animations.js'],
      // client-side search (src/js/search.js), only loaded when the URL contains ?s=
      searchConfig: { index: `/assets/search/${lang}.json`, css: '/assets/css/pages/search.css', bodyClass: SEARCH_BODY_CLASSES, homeUrl: homePath, ...sys.searchResults },
      devReload: dev,
    };
  };
  const render = (template, ctx, outFile) => {
    let html;
    try { html = env.render(template, ctx); } catch (e) { throw new Error(`Rendering ${template} (${ctx.lang}) failed: ${e.message}`); }
    // behaviour scripts are only loaded by pages that contain the component
    const extra = [['eb-advanced-tabs-wrapper', 'tabs.js'], ['data-vidbg-mp4', 'video-background.js']].filter(([m]) => html.includes(m)).map(([, js]) => `<script src="/assets/js/${js}" defer></script>\n`).join('');
    if (extra) html = html.replace('</body>', extra + '</body>');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html);
    return html;
  };

  for (const langInfo of languages) {
    const lang = langInfo.code;
    const searchIndex = [];
    for (const page of Object.values(langs[lang].pages)) {
      const key = page.key;
      const tplCandidates = [page.template, `pages/${key}.${lang}.njk`, `pages/${key}.njk`].filter(Boolean);
      const template = tplCandidates.find((t) => fs.existsSync(path.join(ROOT, 'src', 'templates', t)));
      if (!template) throw new Error(`No template for page "${key}" (${lang}); tried ${tplCandidates.join(', ')}`);

      const cssPage = [`pages/${key}.${lang}.css`, `pages/${key}.css`].find((f) => fs.existsSync(path.join(ROOT, 'src', 'css', f)));
      const alternates = languages.filter((l) => langs[l.code].pages[key]).map((l) => ({ hreflang: l.hreflang, href: langs[l.code].pages[key].path, absolute: site.siteUrl + langs[l.code].pages[key].path }))
        // the original listed the other language first
        .sort((a, b) => (a.hreflang === langInfo.hreflang) - (b.hreflang === langInfo.hreflang));
      const absoluteUrl = site.siteUrl + page.path;
      const homePath = langs[lang].pages.home.path;
      const structuredData = {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', '@id': absoluteUrl, url: absoluteUrl, name: page.meta.title, isPartOf: { '@id': `${site.siteUrl}/#website` }, ...(page.meta.published ? { datePublished: page.meta.published } : {}), ...(page.meta.modified ? { dateModified: page.meta.modified } : {}), breadcrumb: { '@id': `${absoluteUrl}#breadcrumb` }, inLanguage: langInfo.hreflang },
          { '@type': 'BreadcrumbList', '@id': `${absoluteUrl}#breadcrumb`, itemListElement: page.isHome ? [{ '@type': 'ListItem', position: 1, name: page.meta.breadcrumb || page.meta.title }] : [{ '@type': 'ListItem', position: 1, name: langs[lang].pages.home.meta.breadcrumb, item: site.siteUrl + homePath }, { '@type': 'ListItem', position: 2, name: page.meta.breadcrumb || page.meta.title }] },
          { '@type': 'WebSite', '@id': `${site.siteUrl}/#website`, url: `${site.siteUrl}/`, name: site.siteName[lang], description: site.siteDescription[lang], inLanguage: langInfo.hreflang },
        ],
      };
      const ctx = {
        ...ctxFor(lang, page, key),
        absoluteUrl,
        alternates,
        structuredData,
        bodyClass: [page.isHome ? 'home' : '', 'page-template-default page', `page-id-${page.wordpressId}`, BODY_CLASSES, page.bodyClass || ''].filter(Boolean).join(' '),
        stylesheets: [...BASE_CSS, ...(cssPage ? [`/assets/css/${cssPage}`] : [])],
      };
      const html = render(template, ctx, path.join(DIST, page.path, 'index.html'));
      sitemap.push({ loc: absoluteUrl, lastmod: page.meta.modified });
      // search index entry: WordPress post title + visible text of the content area
      const $ = cheerio.load(html);
      $('.entry-content script, .entry-content style').remove();
      searchIndex.push({
        title: page.isHome ? page.meta.title.split(' - ')[0] : page.meta.breadcrumb || page.meta.title,
        url: page.path,
        id: page.wordpressId,
        published: page.meta.published || '',
        text: $('.entry-content').text().replace(/\s+/g, ' ').trim(),
      });
      count++;
    }
    fs.mkdirSync(path.join(DIST, 'assets', 'search'), { recursive: true });
    fs.writeFileSync(path.join(DIST, 'assets', 'search', `${lang}.json`), JSON.stringify(searchIndex));

    // 404 page of the language (nginx/Apache configuration: see README, Deployment)
    const sys = langs[lang].collections.system;
    if (sys) {
      const home = langs[lang].pages.home;
      const page404 = { key: '404', path: home.path + '404.html', meta: { title: sys.notFound.title, robots: 'noindex, follow' }, wordpressId: 0 };
      render('special/404.njk', {
        ...ctxFor(lang, page404, '404'),
        absoluteUrl: site.siteUrl + home.path,
        alternates: [],
        structuredData: { '@context': 'https://schema.org', '@graph': [] },
        bodyClass: NOT_FOUND_BODY_CLASSES,
        opaqueHeader: true,
        stylesheets: [...BASE_CSS, '/assets/css/pages/404.css'],
      }, path.join(DIST, langInfo.pathPrefix || home.path, '404.html'));
    }
  }

  // redirects of the original site (data/redirects.json): HTML fallback page + Apache rules
  const redirects = data.shared.redirects?.redirects || [];
  for (const r of redirects) {
    const file = path.join(DIST, r.from, 'index.html');
    if (fs.existsSync(file)) throw new Error(`data/redirects.json: "${r.from}" is also a page`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `<!DOCTYPE html>\n<html lang="${(languages.find((l) => l.pathPrefix !== '/' && r.from.startsWith(l.pathPrefix)) || languages[0]).htmlLang}"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>Redirect</title>\n<link rel="canonical" href="${site.siteUrl}${r.to}">\n<meta http-equiv="refresh" content="0; url=${r.to}">\n<script>location.replace(${JSON.stringify(r.to)} + location.search + location.hash);</script>\n</head><body><a href="${r.to}">${r.to}</a></body></html>\n`);
  }
  const htaccess = [
    '# Generated by the build (scripts/build/build.mjs) for Apache. See README, Deployment.',
    'DirectoryIndex index.html',
    'ErrorDocument 404 /404.html',
    ...languages.filter((l) => l.pathPrefix && l.pathPrefix !== '/').map((l) => `<If "%{REQUEST_URI} =~ m#^${l.pathPrefix}#">\n  ErrorDocument 404 ${l.pathPrefix}404.html\n</If>`),
    ...redirects.map((r) => `RedirectMatch ${r.status} ^${r.from.replace(/\/$/, '')}/?$ ${r.to}`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(DIST, '.htaccess'), htaccess);

  // robots.txt and sitemaps (the original site published them through Yoast SEO)
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nDisallow:\n\nSitemap: ${site.siteUrl}/sitemap_index.xml\n`);
  const now = new Date().toISOString();
  const urlset = sitemap.map((s) => `\t<url>\n\t\t<loc>${s.loc}</loc>${s.lastmod ? `\n\t\t<lastmod>${s.lastmod}</lastmod>` : ''}\n\t</url>`).join('\n');
  fs.writeFileSync(path.join(DIST, 'page-sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlset}\n</urlset>\n`);
  const index = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\t<sitemap>\n\t\t<loc>${site.siteUrl}/page-sitemap.xml</loc>\n\t\t<lastmod>${now}</lastmod>\n\t</sitemap>\n</sitemapindex>\n`;
  fs.writeFileSync(path.join(DIST, 'sitemap_index.xml'), index);
  fs.writeFileSync(path.join(DIST, 'wp-sitemap.xml'), index);

  // GitHub Pages: no Jekyll processing; sub-path deployments get every root-relative URL prefixed
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
  rebaseDir(DIST, base);

  if (!quiet) console.log(`Built ${count} pages${base !== '/' ? ` (base path ${base})` : ''} into ${path.relative(ROOT, DIST) || '.'}/ in ${Date.now() - t0} ms`);
  return { count };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const baseArg = process.argv.find((a) => a.startsWith('--base='))?.slice(7);
  build({ dev: process.argv.includes('--dev'), ...(baseArg ? { base: baseArg } : {}) }).catch((e) => { console.error(e.validation ? e.message : e); process.exit(1); });
}
