#!/usr/bin/env node
/**
 * ONE-OFF MIGRATION TOOL (not part of the regular build).
 *
 * Converts the content area of an original WordPress page into
 *   - a Nunjucks template (src/templates/pages/<key>.njk) that keeps the original
 *     markup / CSS classes, with every piece of content replaced by a reference
 *     to the page JSON (`c.<path>`), and
 *   - the page content JSON for both languages (data/<lang>/pages/<key>.json, field "content").
 *
 * Content is extracted from the cached crawl, never retyped, so the JSON matches the
 * live site exactly. The English page is extracted with the same template after its
 * Essential Blocks ids are mapped to the Spanish ones (.cache/import/eb-id-map.json);
 * if the structures differ, a separate template per language is generated.
 *
 * Field names come from scripts/import/maps/<key>.mjs (block id / slot -> readable path).
 * Slots without a name get a generated name and are reported, so nothing is lost.
 *
 * Usage: node scripts/import/generate-page.mjs <key> [--separate]
 */
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { PAGES } from '../../tests/helpers/pages.mjs';
import { localUrl, registerAsset, saveAssetRegistry } from './urls.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const key = process.argv[2];
const forceSeparate = process.argv.includes('--separate');
const pg = PAGES.find((p) => p.key === key);
if (!pg) throw new Error('unknown page key ' + key);
const map = (await import(`./maps/${key}.mjs`).catch(() => ({ default: {} }))).default;
const names = map.names || {};
const report = JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/crawl/report.json'), 'utf8'));
const pageFile = (p) => path.join(ROOT, '.cache/crawl/pages', Object.values(report.pages).find((x) => new URL(x.url).pathname === p).slug + '.raw.html');
const idMap = JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/import/eb-id-map.json'), 'utf8'))[key];

const EB_TYPES = '(?:wrapper|row|column|advance-heading|infobox|button|feature-list|advanced-image|advanced-tabs|advanced-navigation)';
const EBID = new RegExp(`^(?:root-)?eb-${EB_TYPES}-([a-z0-9]{7})$`);
const ebIdOf = ($el) => { for (const c of ($el.attr('class') || '').split(/\s+/)) { const m = c.match(EBID); if (m && m[1] !== 'wrapper') return m[1]; } return null; };
const isEbRoot = ($el) => /\bwp-block-essential-blocks-/.test($el.attr('class') || '');
const INNER = ['eb-wrapper-inner-blocks', 'eb-column-inner', 'eb-tab-inner', 'eb-row-inner'];
const isContainer = ($el) => INNER.some((c) => $el.hasClass(c)) || $el.hasClass('entry-content');

function load(file, remapIds) {
  let html = fs.readFileSync(file, 'utf8');
  if (remapIds) html = html.replace(new RegExp(`\\b(root-)?(eb-${EB_TYPES}-[a-z0-9]{7})\\b`, 'g'), (m, root, full) => (root || '') + (remapIds[full] || full));
  const $ = cheerio.load(html, { decodeEntities: false });
  return { $, root: $('.entry-content').first() };
}

/**
 * Walk the content and collect slots. Each slot = {path, mode, get($), set($, token)}.
 * mode: html (innerHTML), attr:<name>, text-node (button label)
 */
function collectSlots($, root) {
  const slots = [];
  let auto = 0;
  const nameFor = (id, field) => {
    const base = names[id] ?? `blocks.${id}`;
    return field ? `${base}.${field}` : base;
  };
  function walk($el, ctxId) {
    const id = ebIdOf($el) || ctxId;
    const cls = $el.attr('class') || '';
    // --- Essential Blocks components with known fields ---------------------------
    if ($el.hasClass('eb-advance-heading-wrapper')) {
      $el.children('.eb-ah-title').each((_, t) => slots.push({ path: nameFor(id, 'title'), el: t, mode: 'html' }));
      $el.children('.eb-ah-subtitle').each((_, t) => slots.push({ path: nameFor(id, 'subtitle'), el: t, mode: 'html' }));
      return;
    }
    if ($el.hasClass('eb-infobox-wrapper')) {
      $el.find('img.eb-infobox-image').each((_, t) => { slots.push({ path: nameFor(id, 'image'), el: t, mode: 'attr:src' }); slots.push({ path: nameFor(id, 'imageAlt'), el: t, mode: 'attr:alt' }); });
      $el.find('.contents-wrapper > .title').each((_, t) => slots.push({ path: nameFor(id, 'title'), el: t, mode: 'html' }));
      $el.find('.contents-wrapper > .description').each((_, t) => slots.push({ path: nameFor(id, 'description'), el: t, mode: 'html' }));
      return;
    }
    if ($el.hasClass('eb-button-wrapper')) {
      $el.find('a.eb-button-anchor').each((_, t) => { slots.push({ path: nameFor(id, 'url'), el: t, mode: 'attr:href' }); slots.push({ path: nameFor(id, 'label'), el: t, mode: 'label' }); });
      return;
    }
    if ($el.hasClass('eb-feature-list-wrapper')) {
      $el.find('li.eb-feature-list-item').each((i, li) => {
        $(li).find('.eb-feature-list-title').each((_, t) => slots.push({ path: nameFor(id, `items.${i}.title`), el: t, mode: 'html' }));
        $(li).find('.eb-feature-list-content').each((_, t) => slots.push({ path: nameFor(id, `items.${i}.text`), el: t, mode: 'html' }));
      });
      return;
    }
    if ($el.hasClass('eb-advanced-image-wrapper')) {
      $el.find('img').each((_, t) => { slots.push({ path: nameFor(id, 'image'), el: t, mode: 'attr:src' }); slots.push({ path: nameFor(id, 'imageAlt'), el: t, mode: 'attr:alt' }); });
      $el.find('figcaption').each((_, t) => slots.push({ path: nameFor(id, 'caption'), el: t, mode: 'html' }));
      return;
    }
    if ($el.hasClass('tabTitles')) {
      $el.find('h6.tab-title-text').each((i, t) => slots.push({ path: nameFor(id, `tabs.${i}`), el: t, mode: 'html' }));
      return;
    }
    // --- containers: runs of plain content between EB blocks become one rich-text field ----
    if (isContainer($el)) {
      const kids = $el.children().toArray();
      let run = []; let runNo = 0;
      const flush = () => {
        if (!run.length) return;
        const textual = run.some((k) => $(k).text().trim() || $(k).find('img,iframe,table').length || /^(img|iframe|hr)$/.test(k.tagName));
        // a tab panel without its own block id: panels.<n>.body (n = position of the tab)
        const tab = $el.hasClass('eb-tab-inner') ? Number($el.parent().attr('data-tab-id')) - 1 : null;
        const field = (tab !== null ? `panels.${tab}.` : '') + (runNo === 0 ? 'body' : `body${runNo + 1}`);
        let p = nameFor(id, field);
        if (slots.some((s) => s.path === p)) { let n = 2; while (slots.some((s) => s.path === `${p}${n}`)) n++; console.warn("  ! duplicate field name", p, "-> using", `${p}${n}`); p = `${p}${n}`; }
        if (textual) slots.push({ path: p, els: run.slice(), mode: 'run', container: $el[0] });
        else run.forEach((k) => {}); // empty paragraphs etc. stay in the template
        runNo++; run = [];
      };
      for (const k of kids) {
        const $k = $(k);
        if (isEbRoot($k) || $k.find('[class*="wp-block-essential-blocks-"]').length) { flush(); walk($k, id); }
        else if ($k.hasClass('process-box')) { // custom HTML "step" box (Acceso y admisión)
          flush();
          $k.find('.process-title').each((_, t) => slots.push({ path: nameFor(id, 'title'), el: t, mode: 'html' }));
          $k.find('.process-subtitle').each((_, t) => slots.push({ path: nameFor(id, 'subtitle'), el: t, mode: 'html' }));
          runNo = 0;
        }
        else run.push(k);
      }
      flush();
      return;
    }
    $el.children().each((_, c) => walk($(c), id));
  }
  walk(root, 'page');
  return slots;
}

// ---- value extraction (with URL localisation) --------------------------------------
function rewriteHtml(html) {
  return html
    .replace(/(src|href|srcset|data-src)=(["'])([^"']+)\2/g, (m, a, q, u) => `${a}=${q}${a === 'srcset' ? u.split(',').map((s) => { const [x, w] = s.trim().split(/\s+/); return [localUrl(x), w].filter(Boolean).join(' '); }).join(', ') : localUrl(u)}${q}`)
    .replace(/&nbsp;/g, ' ');
}
function valueOf($, s) {
  const $el = s.els ? null : $(s.el);
  if (s.mode === 'html') return rewriteHtml($el.html()).trim();
  if (s.mode === 'run') return rewriteHtml(s.els.map((e) => $.html(e)).join('\n')).trim();
  if (s.mode === 'label') return $el.contents().filter((_, n) => n.type === 'text').text();
  if (s.mode.startsWith('attr:')) { const a = s.mode.slice(5); const v = $el.attr(a) ?? ''; return a === 'src' || a === 'href' ? localUrl(v) : v; }
}
function setPath(obj, p, v) {
  const parts = p.split('.');
  let o = obj;
  parts.forEach((k, i) => {
    const isLast = i === parts.length - 1;
    const nextIsIdx = !isLast && /^\d+$/.test(parts[i + 1]);
    if (isLast) o[k] = v; else { o[k] ??= nextIsIdx ? [] : {}; o = o[k]; }
  });
}
const expr = (p) => 'c' + p.split('.').map((k) => (/^\d+$/.test(k) ? `[${k}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? `.${k}` : `['${k}']`)).join('');

// ---- build template from the Spanish page --------------------------------------------
function buildTemplate($, root, slots) {
  for (const [sel, attrs] of Object.entries(map.attrs || {})) for (const [a, p] of Object.entries(attrs)) root.find(sel).first().attr(a, `@@{{ ${expr(p)} }}@@`);
  for (const s of slots) {
    const e = expr(s.path);
    if (s.mode === 'html') $(s.el).html(`@@{{ ${e} | safe }}@@`);
    else if (s.mode === 'run') { $(s.els[0]).before(`@@{{ ${e} | safe }}@@`); s.els.forEach((k) => $(k).remove()); }
    else if (s.mode === 'label') { $(s.el).contents().filter((_, n) => n.type === 'text').remove(); $(s.el).prepend(`@@{{ ${e} }}@@`); }
    else if (s.mode.startsWith('attr:')) $(s.el).attr(s.mode.slice(5), `@@{{ ${e} }}@@`);
  }
  let html = root.html();
  html = html.replace(/@@(\{\{[^@]*\}\})@@/g, '$1').replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)));
  // remaining absolute URLs inside the template (e.g. tab parent ids are fine, links are not)
  html = rewriteHtml(html);
  return pretty(html);
}

/** light pretty printer: line breaks only between div/section/figure boundaries */
function pretty(html) {
  const out = html.replace(/>\s*(<\/?(?:div|section|figure|table|thead|tbody|ul|ol)\b)/g, '>\n$1').replace(/(<\/(?:div|section|figure|table|ul|ol|p|h[1-6])>)\s*(<(?:div|section|figure|p|h[1-6]|ul|ol|table)\b)/g, '$1\n$2');
  let depth = 0;
  return out.split('\n').map((line) => {
    const l = line.trim();
    const opens = (l.match(/<div\b/g) || []).length; const closes = (l.match(/<\/div>/g) || []).length;
    if (l.startsWith('</div')) depth = Math.max(0, depth - 1);
    const r = '  '.repeat(Math.min(depth, 20)) + l;
    depth += opens - closes + (l.startsWith('</div') ? 1 : 0);
    return r;
  }).filter((l) => l.trim()).join('\n');
}

// ---- main ---------------------------------------------------------------------------------
const es = load(pageFile(pg.es));
const esSlots = collectSlots(es.$, es.root);
const contentEs = {}; for (const s of esSlots) setPath(contentEs, s.path, valueOf(es.$, s));

const en = load(pageFile(pg.en), idMap);
const enSlots = collectSlots(en.$, en.root);
const contentEn = {}; for (const s of enSlots) setPath(contentEn, s.path, valueOf(en.$, s));

// one template for both languages only when the English markup is identical once ids are mapped
const tplEs = buildTemplate(es.$, es.root, esSlots);
const tplEn = buildTemplate(en.$, en.root, enSlots);
const sameShape = !forceSeparate && idMap && tplEs === tplEn;
const outDir = path.join(ROOT, 'src/templates/pages');
fs.mkdirSync(outDir, { recursive: true });
const banner = (lang) => `{#-
  Page template: ${key}${lang ? ' (' + lang + ')' : ''}.
  Markup reproduces the original WordPress/Essential Blocks output (CSS classes are
  needed by src/css/pages/${key}.*.css). All content comes from data/<lang>/pages/${key}.json -> "content" (c).
-#}
{% extends "layouts/base.njk" %}
{% set c = page.content %}
{% block content %}
`;
const tail = '\n{% endblock %}\n';
// map.keepTemplate: the template was finished by hand (loops over collections); only refresh the data
if (map.keepTemplate) console.log('  template kept (keepTemplate)');
else {
for (const f of [`${key}.njk`, `${key}.es.njk`, `${key}.en.njk`]) fs.rmSync(path.join(outDir, f), { force: true });
if (sameShape) fs.writeFileSync(path.join(outDir, `${key}.njk`), banner() + tplEs + tail);
else {
  fs.writeFileSync(path.join(outDir, `${key}.es.njk`), banner('es') + tplEs + tail);
  fs.writeFileSync(path.join(outDir, `${key}.en.njk`), banner('en') + tplEn + tail);
}
}
// extra values: { path: value } for both languages, or { es: {...}, en: {...} }
const extra = map.extra || {};
for (const [lang, content] of [['es', contentEs], ['en', contentEn]]) for (const [p, v] of Object.entries(extra.es || extra.en ? extra[lang] || {} : extra)) setPath(content, p, v);
for (const [lang, content] of [['es', contentEs], ['en', contentEn]]) {
  const f = path.join(ROOT, 'data', lang, 'pages', `${key}.json`);
  const existing = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  existing.content = content;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(existing, null, 2) + '\n');
}
saveAssetRegistry();
const unnamed = [...new Set(esSlots.map((s) => s.path).filter((p) => p.startsWith('blocks.')))];
console.log(`${key}: ${esSlots.length} slots (es), ${enSlots.length} (en), template ${sameShape ? 'shared' : 'per language'}; unnamed: ${unnamed.length}`);
if (unnamed.length) console.log('  ' + unnamed.join('\n  '));
