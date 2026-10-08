#!/usr/bin/env node
/**
 * Content validation (run by `npm run validate` and before every build).
 *
 * Checks:
 *  - JSON syntax (scripts/build/data.mjs reports file, line and column)
 *  - JSON schemas in schemas/ (required fields, types, URL formats, slugs)
 *  - duplicate identifiers: page paths, WordPress ids, menu ids, slugs, people ids, table ids
 *  - cross references: menu → pages, research lines → people, page translations
 *  - every link / image / document in the content: root-relative paths must exist as a
 *    page or as a file in public/, external URLs must be well-formed
 *
 * Every message names the JSON file, the field and the reason, e.g.
 *   data/es/pages/home.json → content.hero.intro (href): "/foo/" is neither a page nor a file in public/
 */
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { loadData, ROOT, ContentError } from '../build/data.mjs';

const SCHEMAS = path.join(ROOT, 'schemas');
const PUBLIC = path.join(ROOT, 'public');
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const allowlist = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'validation', 'allowlist.json'), 'utf8')).urls;

function schemaValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });
  addFormats(ajv);
  for (const f of fs.readdirSync(SCHEMAS).filter((x) => x.endsWith('.json'))) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMAS, f), 'utf8')), f);
  return (schema, value, file, errors) => {
    const validate = ajv.getSchema(schema);
    if (validate(value)) return;
    for (const e of validate.errors) {
      const field = (e.instancePath || '/').replace(/^\//, '').replace(/\//g, '.') || '(root)';
      let reason = e.message;
      if (e.keyword === 'required') reason = `missing required field "${e.params.missingProperty}"`;
      if (e.keyword === 'additionalProperties') reason = `unknown field "${e.params.additionalProperty}" (typo?)`;
      if (e.keyword === 'format') reason = `not a valid ${e.params.format}: ${JSON.stringify(e.data)}`;
      if (e.keyword === 'pattern') reason = `invalid value ${JSON.stringify(e.data)} (expected pattern ${e.params.pattern})`;
      errors.push(`${rel(file)} → ${field}: ${reason}`);
    }
  };
}

/** walk all string values, yielding [fieldPath, value] */
function* strings(obj, p = '') {
  if (typeof obj === 'string') { yield [p, obj]; return; }
  if (Array.isArray(obj)) { for (let i = 0; i < obj.length; i++) yield* strings(obj[i], `${p}[${i}]`); return; }
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) yield* strings(v, p ? `${p}.${k}` : k);
}
const URL_FIELD = /(^|\.)(image|src|url|video|videoPoster|flag|logo|favicon|portalUrl|contactUrl|mapEmbedUrl)$/i;

export function validate(data) {
  const errors = [];
  const warnings = [];
  const check = schemaValidator();
  const { site, navigation, langs, shared, files } = data;
  check('site.schema.json', site, files.site, errors);
  check('navigation.schema.json', navigation, files.navigation, errors);
  if (shared.people) check('people.schema.json', shared.people, files.collections.people, errors);

  const langCodes = site.languages.map((l) => l.code);
  const pagePaths = new Map();
  for (const lang of langCodes) {
    if (!langs[lang]) { errors.push(`data/site.json → languages: language "${lang}" has no folder data/${lang}/`); continue; }
    const wpIds = new Map();
    for (const [key, page] of Object.entries(langs[lang].pages)) {
      const file = files.pages[`${lang}/${key}`];
      const { key: _k, ...json } = page;
      check('page.schema.json', json, file, errors);
      if (page.path) {
        if (pagePaths.has(page.path)) errors.push(`${rel(file)} → path: "${page.path}" is also used by ${pagePaths.get(page.path)}`);
        pagePaths.set(page.path, rel(file));
      }
      if (wpIds.has(page.wordpressId)) errors.push(`${rel(file)} → wordpressId: ${page.wordpressId} is also used by ${wpIds.get(page.wordpressId)}`);
      wpIds.set(page.wordpressId, rel(file));
      for (const other of langCodes) if (other !== lang && langs[other] && !langs[other].pages[key]) warnings.push(`${rel(file)}: no translation in data/${other}/pages/${key}.json (no language switch target / hreflang)`);
    }
    if (!Object.values(langs[lang].pages).some((p) => p.isHome)) errors.push(`data/${lang}/pages: no page has "isHome": true`);
    if (!langs[lang].pages.home) errors.push(`data/${lang}/pages/home.json: the home page must use the key "home"`);
    const c = langs[lang].collections;
    if (c['research-lines']) check('research-lines.schema.json', c['research-lines'], files.collections[`${lang}/research-lines`], errors);
    if (c['training-activities']) check('training-activities.schema.json', c['training-activities'], files.collections[`${lang}/training-activities`], errors);
    if (c.system) check('system.schema.json', c.system, files.collections[`${lang}/system`], errors);
    else errors.push(`data/${lang}/system.json: missing (texts of the 404 page and the search results)`);
  }

  // duplicates and cross references in collections
  const dup = (list, keyFn, file, field) => {
    const seen = new Map();
    list.forEach((item, i) => { const k = keyFn(item); if (k === undefined) return; if (seen.has(k)) errors.push(`${rel(file)} → ${field}[${i}]: duplicate identifier "${k}" (also at index ${seen.get(k)})`); else seen.set(k, i); });
  };
  const people = new Set((shared.people?.people || []).map((p) => p.id));
  if (shared.people) dup(shared.people.people, (p) => p.id, files.collections.people, 'people');
  for (const lang of langCodes) {
    const c = langs[lang]?.collections || {};
    const rl = c['research-lines'];
    if (rl) {
      const f = files.collections[`${lang}/research-lines`];
      dup(rl.lines, (l) => l.slug, f, 'lines');
      dup(rl.lines, (l) => l.number, f, 'lines(number)');
      rl.lines.forEach((l, i) => l.professors?.forEach((id, j) => { if (!people.has(id)) errors.push(`${rel(f)} → lines[${i}].professors[${j}]: "${id}" does not exist in data/people.json`); }));
    }
    const ta = c['training-activities'];
    if (ta) {
      const f = files.collections[`${lang}/training-activities`];
      dup(ta.activities, (a) => a.slug, f, 'activities');
      const sched = langs[lang].pages.formacion?.content?.schedule?.tableId;
      dup([...ta.activities, ...(sched ? [{ tableId: sched }] : [])], (a) => a.tableId, f, 'activities(tableId)');
    }
    // navigation → pages
    const nav = navigation[lang];
    if (!nav) { errors.push(`data/navigation.json: no menu for language "${lang}"`); continue; }
    const ids = [];
    const walk = (items, p) => items.forEach((it, i) => {
      ids.push(it.id);
      const field = `${lang}.${p}[${i}]`;
      if (it.page && !langs[lang].pages[it.page]) errors.push(`data/navigation.json → ${field}.page: page "${it.page}" does not exist in data/${lang}/pages/`);
      if (!it.page && !it.url && !it.children) errors.push(`data/navigation.json → ${field}: needs "page", "url" or "children"`);
      if (it.children) walk(it.children, `${p}[${i}].children`);
    });
    walk(nav.items, 'items');
    dup(ids.map((id) => ({ id })), (x) => x.id, files.navigation, `${lang}.items(id)`);
    if (!langCodes.includes(nav.languageSwitcher.language)) errors.push(`data/navigation.json → ${lang}.languageSwitcher.language: unknown language "${nav.languageSwitcher.language}"`);
  }

  // links, images and documents in every JSON file
  const allFiles = [
    [files.site, site], [files.navigation, navigation],
    ...Object.entries(shared).map(([n, v]) => [files.collections[n], v]),
    ...langCodes.flatMap((l) => [...Object.entries(langs[l]?.pages || {}).map(([k, v]) => [files.pages[`${l}/${k}`], v]), ...Object.entries(langs[l]?.collections || {}).map(([n, v]) => [files.collections[`${l}/${n}`], v])]),
  ];
  for (const [file, json] of allFiles) {
    for (const [field, value] of strings(json)) {
      if (field === 'sourceUrl' || field.endsWith('.description') && !/<a |<img /.test(value)) continue;
      const refs = [];
      if (/<[a-z]/i.test(value)) {
        for (const m of value.matchAll(/\b(href|src|data-src)\s*=\s*(["'])(.*?)\2/gi)) refs.push([m[1].toLowerCase(), m[3]]);
        for (const m of value.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gi)) m[2].split(',').forEach((s) => refs.push(['srcset', s.trim().split(/\s+/)[0]]));
      } else if (URL_FIELD.test(field) && value) refs.push(['value', value]);
      for (const [attr, url] of refs) {
        const problem = checkUrl(url.replace(/&amp;/g, '&'), pagePaths);
        if (!problem) continue;
        const allowed = allowlist.find((a) => a.file === rel(file) && a.value === url);
        if (allowed) { warnings.push(`${rel(file)} → ${field} (${attr}): ${problem} — allowed: ${allowed.reason}`); continue; }
        errors.push(`${rel(file)} → ${field}${attr === 'value' ? '' : ` (${attr})`}: ${problem}`);
      }
    }
  }
  return Object.assign(errors, { warnings });
}

function checkUrl(url, pagePaths) {
  if (!url || /^#/.test(url)) return null;
  if (/^mailto:/i.test(url)) return /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/i.test(url) ? null : `invalid e-mail link "${url}"`;
  if (/^tel:/i.test(url)) return null;
  if (/^https?:\/\//i.test(url)) { try { new URL(url); return null; } catch { return `malformed URL "${url}"`; } }
  if (url.startsWith('//')) return `protocol-relative URL "${url}" (use https://)`;
  if (!url.startsWith('/')) return `"${url}" is not a valid link (use https://…, mailto:…, or a path starting with /)`;
  const clean = decodeURIComponent(url.split(/[?#]/)[0]);
  if (pagePaths.has(clean) || pagePaths.has(clean + '/')) return null;
  const f = path.join(PUBLIC, clean);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return null;
  return `"${url}" is neither a page nor a file in public/`;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  try {
    const data = loadData();
    const errors = validate(data);
    for (const w of errors.warnings) console.log('  ⚠ ' + w);
    if (errors.length) { console.error(`\n✗ ${errors.length} problem(s):\n` + errors.map((e) => '  ✗ ' + e).join('\n')); process.exit(1); }
    console.log(`✓ content is valid (${errors.warnings.length} warning(s))`);
  } catch (e) {
    if (e instanceof ContentError) { console.error('✗ ' + e.message); process.exit(1); }
    throw e;
  }
}
