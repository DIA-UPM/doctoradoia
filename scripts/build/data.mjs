/**
 * Loads all JSON content (data/) into one object used by the build, the validator
 * and the tests. Throws a readable error for malformed JSON.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
export const DATA = path.join(ROOT, 'data');

export class ContentError extends Error {
  constructor(file, field, reason) {
    super(`${path.relative(ROOT, file).replace(/\\/g, '/')}${field ? ` → ${field}` : ''}: ${reason}`);
    this.file = file; this.field = field; this.reason = reason;
  }
}

export function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  try { return JSON.parse(text); } catch (e) {
    const pos = Number((e.message.match(/position (\d+)/) || [])[1]);
    let where = '';
    if (!Number.isNaN(pos)) { const before = text.slice(0, pos); where = ` (line ${before.split('\n').length}, column ${pos - before.lastIndexOf('\n')})`; }
    throw new ContentError(file, null, `malformed JSON${where}: ${e.message}`);
  }
}

const listJson = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []);

export function loadData() {
  const site = readJson(path.join(DATA, 'site.json'));
  const navigation = readJson(path.join(DATA, 'navigation.json'));
  const files = { site: path.join(DATA, 'site.json'), navigation: path.join(DATA, 'navigation.json'), pages: {}, collections: {} };
  const shared = {};
  for (const f of listJson(DATA)) {
    const name = f.replace(/\.json$/, '');
    if (name === 'site' || name === 'navigation') continue;
    shared[name] = readJson(path.join(DATA, f));
    files.collections[name] = path.join(DATA, f);
  }
  const langs = {};
  for (const { code } of site.languages) {
    const dir = path.join(DATA, code);
    const pages = {};
    for (const f of listJson(path.join(dir, 'pages'))) {
      const key = f.replace(/\.json$/, '');
      pages[key] = { key, ...readJson(path.join(dir, 'pages', f)) };
      files.pages[`${code}/${key}`] = path.join(dir, 'pages', f);
    }
    const collections = {};
    for (const f of listJson(dir)) {
      const name = f.replace(/\.json$/, '');
      collections[name] = readJson(path.join(dir, f));
      files.collections[`${code}/${name}`] = path.join(dir, f);
    }
    langs[code] = { pages, collections };
  }
  return { site, navigation, shared, langs, files };
}
