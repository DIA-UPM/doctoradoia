#!/usr/bin/env node
/**
 * ONE-OFF MIGRATION TOOL (not part of the regular build).
 *
 * Rebuilds the stylesheet of every crawled WordPress page from the ORIGINAL theme /
 * plugin CSS files (WP Fastest Cache keeps their <link> tags in HTML comments) plus
 * the inline <style> blocks, in document order, and then:
 *   1. rewrites url(...) to local assets (fonts -> /assets/fonts, images -> /assets/images)
 *   2. splits rules shared by every page from page-specific rules
 *      (page-specific = Essential Blocks per-post styles, Astra per-post dynamic CSS)
 *   3. removes rules whose selectors never match the rendered HTML of the site
 *      (PurgeCSS, with a safelist for classes added at runtime by JavaScript)
 *   4. renames Essential Blocks ids of English pages to the ids of the Spanish
 *      page when both share the same block structure, so a single template
 *      serves both languages.
 *
 * Output: src/css/{fonts,variables,theme,blocks,custom}.css, src/css/pages/*.css,
 *         .cache/import/css-assets.json (assets that must be copied) and
 *         .cache/import/eb-id-map.json (EN -> ES block id mapping)
 *
 * Usage: node scripts/import/migrate-css.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postcss from 'postcss';
import { PurgeCSS } from 'purgecss';
import * as cheerio from 'cheerio';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const CRAWL = path.join(ROOT, '.cache', 'crawl');
const report = JSON.parse(fs.readFileSync(path.join(CRAWL, 'report.json'), 'utf8'));
const OUT = path.join(ROOT, 'src', 'css');
const IMPORT = path.join(ROOT, '.cache', 'import');
fs.mkdirSync(path.join(OUT, 'pages'), { recursive: true });
fs.mkdirSync(IMPORT, { recursive: true });

import { PAGES } from '../../tests/helpers/pages.mjs';
const pageKeyOf = (url) => {
  const p = new URL(url).pathname;
  for (const pg of PAGES) { if (pg.es === p) return { key: pg.key, lang: 'es' }; if (pg.en === p) return { key: pg.key, lang: 'en' }; }
  throw new Error('unknown page ' + url);
};

const resByUrl = report.resources;
const norm = (u, base) => { try { const x = new URL(u.replace(/&#038;/g, '&').replace(/&amp;/g, '&'), base); x.hash = ''; if (x.host === 'doctoradoia.dia.fi.upm.es') x.protocol = 'https:'; return x.href; } catch { return null; } };
const readRes = (u) => { const r = resByUrl[u]; if (!r?.file) throw new Error('not downloaded: ' + u); return fs.readFileSync(path.join(ROOT, r.file), 'utf8'); };

/** group a stylesheet by its origin, to organise the output files */
function groupOf(id, url) {
  const s = (id || '') + ' ' + (url || '');
  if (/font|googleapis|dashicons|eicons|fontawesome|all\.min\.css|brands|solid\.css/i.test(s)) return 'fonts';
  if (/wp-custom-css|astra-child|chld_thm/.test(s)) return 'custom';
  if (/astra|megamenu|hfe|header-footer|elementor|eael|tablepress|prettyphoto|lightbox|vidbg|emoji/i.test(s)) return 'theme';
  return 'blocks';
}

/**
 * Ordered list of {group, css, base} for a page.
 * The CSS that the live site really serves is the WP Fastest Cache bundles (wpfc-minified):
 * they can be older than the theme/plugin files they were built from (stale cache), so the
 * bundles are the source of truth. The original files (kept by the cache plugin inside HTML
 * comments) are only used to know which file - and therefore which output group - each rule
 * comes from ({ original: true } chunks).
 */
function pageChunks(html, pageUrl) {
  const chunks = [];
  const re = /<!--\s*(<link[^>]+>)\s*-->|<link\s[^>]*rel=['"]stylesheet['"][^>]*>|<style([^>]*)>([\s\S]*?)<\/style>/g;
  for (const m of html.matchAll(re)) {
    if (m[1]) { // commented original
      const href = m[1].match(/href=['"]([^'"]+)['"]/)?.[1]; const id = m[1].match(/id=['"]([^'"]+)['"]/)?.[1];
      if (!href || !/stylesheet/.test(m[1])) continue;
      const u = norm(href, pageUrl);
      chunks.push({ group: groupOf(id, u), css: readRes(u), base: u, src: id || u, original: true });
    } else if (m[0].startsWith('<link')) {
      const href = m[0].match(/href=['"]([^'"]+)['"]/)?.[1];
      const u = norm(href, pageUrl);
      if (/wpfc-minified/.test(u)) { chunks.push({ group: 'auto', css: readRes(u), base: u, src: u }); continue; }
      chunks.push({ group: groupOf(m[0].match(/id=['"]([^'"]+)['"]/)?.[1], u), css: readRes(u), base: u, src: u });
    } else {
      const id = m[2].match(/id=['"]([^'"]+)['"]/)?.[1] || 'inline';
      chunks.push({ group: groupOf(id, ''), css: m[3], base: pageUrl, src: id });
    }
  }
  return chunks;
}

// ---- asset rewriting --------------------------------------------------------
const assets = {}; // localPath -> source file
function localAssetFor(absUrl) {
  const r = resByUrl[absUrl];
  if (!r?.file) return null;
  const ext = path.extname(new URL(absUrl).pathname).toLowerCase();
  const isFont = /\.(woff2?|ttf|eot|otf)$/.test(ext) || /svg/.test(ext) && /font/.test(absUrl);
  let name = path.basename(decodeURIComponent(new URL(absUrl).pathname));
  if (/fonts\.gstatic\.com/.test(absUrl)) { // gstatic: /s/<family>/<ver>/<hash>.woff2
    const parts = new URL(absUrl).pathname.split('/'); name = `${parts[2]}-${parts[4]}`;
  }
  let local = (isFont ? '/assets/fonts/' : '/assets/images/') + name;
  if (assets[local] && assets[local] !== r.file) { // same file name, different file
    const h = crypto.createHash('md5').update(absUrl).digest('hex').slice(0, 6);
    local = local.replace(/(\.[a-z0-9]+)$/i, `-${h}$1`);
  }
  assets[local] = r.file;
  return local;
}
function rewriteUrls(css, base) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q, u) => {
    if (u.startsWith('data:') || u.startsWith('#')) return all;
    const abs = norm(u, base);
    const local = abs && localAssetFor(abs);
    if (!local) return all; // left untouched; reported by the link checker
    const suffix = (u.match(/[?#].*$/) || [''])[0].replace(/^\?[^#]*/, '');
    return `url(${q}${local}${suffix}${q})`;
  });
}

// ---- google fonts: <link> to fonts.googleapis.com handled as chunk; its url()s point to gstatic

// whitespace-insensitive form, so minified and unminified copies of a rule compare equal
const squash = (t) => t.replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/:\s+/g, ':').replace(/;}/g, '}').trim();

// ---- build per-page rule lists ---------------------------------------------
const pages = Object.values(report.pages);
const perPage = {}; // key.lang -> [{group, text}]
const groupOfRule = new Map(); // squashed rule -> group of the original file that contains it
function rulesOf(html, pageUrl) {
  const rules = [];
  for (const ch of pageChunks(html, pageUrl)) {
    let root;
    // Essential Blocks sometimes writes selectors HTML-escaped ("&gt;"). Depending on when the
    // cache bundle of a page was built, the served bundle contains them escaped (the browser
    // drops those rules as invalid) or unescaped (valid). Served bundles are reproduced exactly:
    // escaped rules are dropped, like the browser does. The original files are only used for
    // grouping, so they are decoded to match the unescaped variant.
    const css = ch.original
      ? ch.css.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
      : ch.css.replace(/[^{}]*&(?:gt|lt|amp);[^{}]*{[^{}]*}/g, '');
    try { root = postcss.parse(rewriteUrls(css, ch.base)); } catch (e) { console.warn('parse error in', ch.src, e.message); continue; }
    root.each((node) => {
      if (node.type === 'comment') return;
      if (node.type === 'atrule' && node.name === 'charset') return;
      const text = squash(node.toString());
      if (ch.original) { if (!groupOfRule.has(text)) groupOfRule.set(text, ch.group); return; }
      rules.push({ group: ch.group, text, src: ch.src });
    });
  }
  // bundle rules take the group of the original file they come from; rules that only exist in
  // the (stale) bundle take the group of the rule before them
  let prev = 'theme';
  for (const r of rules) { if (r.group === 'auto') r.group = groupOfRule.get(r.text) || prev; prev = r.group; }
  return rules;
}
for (const p of pages) {
  const html = fs.readFileSync(path.join(CRAWL, 'pages', p.slug + '.raw.html'), 'utf8');
  const { key, lang } = pageKeyOf(p.url);
  const rules = rulesOf(html, p.url);
  perPage[`${key}.${lang}`] = { key, lang, rules, rendered: path.join(CRAWL, 'pages', p.slug + '.rendered.html'), raw: path.join(CRAWL, 'pages', p.slug + '.raw.html') };
}

// WordPress system pages that are not in the sitemap: the 404 page and the search results
// page (fetched once into .cache/crawl/pages/_404.raw.html and _search.raw.html)
const SPECIAL = { '404': ['_404.raw.html', '_404_en.raw.html'], search: ['_search.raw.html', '_search_none.raw.html', '_search_en.raw.html'] };
const special = {};
for (const [name, files] of Object.entries(SPECIAL)) {
  const htmls = files.map((x) => path.join(CRAWL, 'pages', x)).filter((x) => fs.existsSync(x));
  if (!htmls.length) { console.warn('missing snapshot for', name); continue; }
  special[name] = { files: htmls, rules: rulesOf(fs.readFileSync(htmls[0], 'utf8'), 'https://doctoradoia.dia.fi.upm.es/') };
}

// ---- EN -> ES Essential Blocks id mapping -------------------------------------
const EB_ID = /\b(?:root-)?eb-[a-z-]+-[a-z0-9]{7}\b/g;
const ebIds = (file) => {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  const ids = [];
  $('.entry-content [class]').each((_, el) => { for (const c of ($(el).attr('class') || '').split(/\s+/)) if (/^eb-[a-z-]+-[a-z0-9]{7}$/.test(c) && !ids.includes(c)) ids.push(c); });
  return ids;
};
const idMap = {};
for (const pg of PAGES) {
  const es = perPage[`${pg.key}.es`], en = perPage[`${pg.key}.en`];
  const a = ebIds(es.raw), b = ebIds(en.raw);
  const typ = (s) => s.replace(/-[a-z0-9]{7}$/, '');
  if (a.length === b.length && a.every((x, i) => typ(x) === typ(b[i]))) {
    idMap[pg.key] = Object.fromEntries(b.map((x, i) => [x, a[i]]));
  } else idMap[pg.key] = null;
}
fs.writeFileSync(path.join(IMPORT, 'eb-id-map.json'), JSON.stringify(idMap, null, 2));
// every `eb-<block type>-<id>` occurrence (also inside eb-parent-eb-… / root-eb-…) is renamed
const EB_ANY = /eb-(?:wrapper|row|column|advance-heading|infobox|button|feature-list|advanced-image|advanced-tabs|advanced-navigation)-[a-z0-9]{7}(?![a-z0-9])/g;
const remap = (text, map) => (map ? text.replace(EB_ANY, (m) => map[m] || m) : text);

// ---- split shared vs page specific -----------------------------------------
const keys = Object.keys(perPage);
const counts = new Map();
for (const k of keys) for (const t of new Set(perPage[k].rules.map((r) => r.text))) counts.set(t, (counts.get(t) || 0) + 1);
const shared = []; const seenShared = new Set();
for (const k of keys) for (const r of perPage[k].rules) if (counts.get(r.text) === keys.length && !seenShared.has(r.text)) { seenShared.add(r.text); shared.push(r); }

// ---- purge ------------------------------------------------------------------
const SAFELIST = {
  // wp-element-button only appears inside :not(...) in the WordPress link-colour rules
  standard: [/^__keep-fonts\d+$/, /^wp-element-button$/, /^ast-/, /^menu-/, /toggled/, /active/, /inactive/, /^eb__/, /^eb___/, /animate__/, /^focus/, /^sub-menu/, /^is-/, /^has-/, /^current/, /^sticky/, /^ast-header-sticked/, /^vidbg/, /^dropdown/, /^screen-reader/, /^skip-link/, /^open/, /^show/],
  deep: [/ast-main-header-nav-open/, /ast-mobile-popup/, /ast-header-break-point/, /ast-desktop/, /ast-sticky/, /ast-fixed/],
  greedy: [/ast-/],
};
const contentFiles = [...Object.values(perPage).flatMap((p) => [p.rendered]), ...Object.values(special).flatMap((x) => x.files)];
async function purge(css, content) {
  // PurgeCSS wrongly removes selectors such as `a:where(:not(.wp-element-button))` (WordPress
  // link colours). Each `:where(:not(...))` is replaced by a safelisted placeholder class
  // before purging and restored afterwards.
  const hidden = [];
  css = css.replace(/:where\(:not\(([^()]*)\)\)/g, (m) => `.__wherenot${hidden.push(m) - 1}`);
  const res = await new PurgeCSS().purge({ content, css: [{ raw: css }], safelist: { ...SAFELIST, standard: [...SAFELIST.standard, /^__wherenot\d+$/] }, fontFace: true, keyframes: true, variables: false, rejected: false });
  res[0].css = res[0].css.replace(/\.__wherenot(\d+)/g, (m, i) => hidden[+i]);
  // drop WordPress admin / block-editor-only rules (never match on the public site)
  const root = postcss.parse(res[0].css);
  root.walkRules((r) => {
    if (!/wp-admin|editor-styles-wrapper|block-editor|is-root-container|admin-bar/.test(r.selector)) return;
    const keep = r.selectors.filter((s) => !/wp-admin|editor-styles-wrapper|block-editor|is-root-container|admin-bar/.test(s));
    if (keep.length) r.selectors = keep; else r.remove();
  });
  root.walkAtRules('media', (m) => { if (!m.nodes?.length) m.remove(); });
  return root.toString();
}

const header = (what) => `/*\n * ${what}\n * Migrated from the original WordPress theme/plugins by scripts/import/migrate-css.mjs.\n * Unused rules were removed; edit freely, this file is not regenerated by the build.\n */\n`;
const groups = { fonts: [], theme: [], blocks: [], custom: [] };
for (const r of shared) groups[r.group].push(r.text);

// custom properties of :root go to variables.css
const variables = [];
for (const g of Object.keys(groups)) groups[g] = groups[g].filter((t) => { if (/^:root\s*\{[^}]*--[\s\S]*\}$/.test(t) && !/@media/.test(t)) { variables.push(t); return false; } return true; });

const files = {};
files['variables.css'] = header('Design tokens: global colours, font sizes and spacing (Astra global palette + WordPress presets).') + variables.join('\n');
const titles = { fonts: 'Web fonts and icon fonts (self-hosted).', theme: 'Theme layout: Astra header, navigation, footer and page container.', blocks: 'Content blocks: WordPress block library and Essential Blocks (tabs, info boxes, headings, rows/columns).', custom: 'Site-specific customisations (child theme + custom CSS of the original site).' };
// PurgeCSS only keeps @font-face rules whose family is used in the same CSS input. The
// families are declared in other files (theme/page CSS) and in an inline style attribute of
// the header ('Syne'), so a marker rule listing every family used anywhere keeps them; it is
// removed afterwards.
const families = new Set(["'Syne'"]);
for (const p of Object.values(perPage)) {
  for (const r of p.rules) {
    if (r.text.startsWith('@font-face')) continue;
    for (const m of r.text.matchAll(/font-family:\s*([^;}!]+)/g)) {
      for (const fam of m[1].split(',')) {
        const n = fam.trim().replace(/^["']|["']$/g, '');
        if (n && !/^(inherit|initial|sans-serif|serif|monospace|var\()/.test(n)) families.add(`'${n}'`);
      }
    }
  }
}
const KEEP_FONTS = [...families].map((fam, i) => `.__keep-fonts${i}{font-family:${fam}}`).join('\n');
for (const g of Object.keys(groups)) files[`${g}.css`] = header(titles[g]) + (await purge(groups[g].join('\n') + '\n' + KEEP_FONTS, contentFiles)).replace(/\.__keep-fonts\d+\s*\{[^}]*\}\s*/g, '');

// page-specific
const pageCss = {};
for (const pg of PAGES) {
  for (const lang of ['es', 'en']) {
    const p = perPage[`${pg.key}.${lang}`];
    const own = p.rules.filter((r) => counts.get(r.text) !== keys.length).map((r) => (lang === 'en' ? remap(r.text, idMap[pg.key]) : r.text));
    const dedup = [...new Set(own)].join('\n');
    pageCss[`${pg.key}.${lang}`] = await purge(dedup, [p.rendered, perPage[`${pg.key}.es`].rendered].map((f) => (lang === 'en' && idMap[pg.key] ? f : f)));
  }
}
// purge for EN used the ES rendered page as content too (ids were remapped to ES ids)
for (const pg of PAGES) {
  const es = pageCss[`${pg.key}.es`], en = pageCss[`${pg.key}.en`];
  if (idMap[pg.key] && es === en) files[`pages/${pg.key}.css`] = header(`Page-specific styles: ${pg.key} (shared by ES and EN).`) + es;
  else {
    files[`pages/${pg.key}.es.css`] = header(`Page-specific styles: ${pg.key} (Spanish).`) + es;
    files[`pages/${pg.key}.en.css`] = header(`Page-specific styles: ${pg.key} (English).`) + en;
  }
}

// system pages: only what they add to the shared CSS
for (const [name, sp] of Object.entries(special)) {
  const own = [...new Set(sp.rules.filter((r) => counts.get(r.text) !== keys.length).map((r) => r.text))].join('\n');
  files[`pages/${name}.css`] = header(`Page-specific styles: ${name === '404' ? '404 error page' : 'search results (rendered by src/js/search.js)'}.`) + (await purge(own, sp.files));
}

for (const [f, c] of Object.entries(files)) { fs.writeFileSync(path.join(OUT, f), c); console.log(f.padEnd(28), (c.length / 1024).toFixed(1) + ' KB'); }
// only keep assets still referenced after purging
const allCss = Object.values(files).join('\n');
const used = Object.fromEntries(Object.entries(assets).filter(([local]) => allCss.includes(local)));
fs.writeFileSync(path.join(IMPORT, 'css-assets.json'), JSON.stringify(used, null, 2));
console.log('assets referenced by CSS:', Object.keys(used).length, 'id-maps:', Object.entries(idMap).map(([k, v]) => `${k}:${v ? 'shared' : 'separate'}`).join(' '));
