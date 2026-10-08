/**
 * ONE-OFF MIGRATION HELPER: maps URLs found in the original content to their place
 * in the static site and records which crawled files have to be copied to public/.
 *
 *  - pages of the site               -> root-relative path (/investigacion/)
 *  - images (site or third-party)    -> /assets/images/<file>
 *  - documents (pdf, xlsx, zip, ...) -> same path as on the original site
 *                                       (/wp-content/uploads/sites/8/...), so existing
 *                                       links to the documents keep working
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const HOST = 'doctoradoia.dia.fi.upm.es';
const REG = path.join(ROOT, '.cache/import/assets.json');
const report = JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/crawl/report.json'), 'utf8'));
const registry = fs.existsSync(REG) ? JSON.parse(fs.readFileSync(REG, 'utf8')) : {};

const IMG = /\.(png|jpe?g|gif|svg|webp)$/i;
const DOC = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|zip|rtf|txt)$/i;

export function registerAsset(local, sourceUrl) {
  const r = report.resources[sourceUrl];
  if (!r?.file) { console.warn('  ! not downloaded:', sourceUrl); return false; }
  if (registry[local] && registry[local].source !== sourceUrl) return false;
  registry[local] = { source: sourceUrl, file: r.file };
  return true;
}

export function localUrl(raw) {
  if (!raw || /^(#|mailto:|tel:|data:|javascript:)/i.test(raw) || raw.includes('{{')) return raw;
  // relative links (e.g. a mail address without mailto:) are kept exactly as on the original site
  if (!/^(https?:)?\/\//i.test(raw) && !raw.startsWith('/')) return raw;
  let u;
  try { u = new URL(raw.replace(/&amp;/g, '&'), `https://${HOST}/`); } catch { return raw; }
  const p = decodeURIComponent(u.pathname);
  if (IMG.test(p) && (u.host === HOST || report.resources[u.href])) {
    let local = '/assets/images/' + path.basename(p);
    if (!registerAsset(local, u.href)) {
      local = '/assets/images/' + u.host.split('.')[0] + '-' + path.basename(p);
      registerAsset(local, u.href);
    }
    return local;
  }
  if (u.host !== HOST) return raw;
  if (DOC.test(p)) { registerAsset(u.pathname, u.href); return u.pathname + u.search + u.hash; }
  return u.pathname + u.search + u.hash;
}

export function saveAssetRegistry() {
  fs.mkdirSync(path.dirname(REG), { recursive: true });
  fs.writeFileSync(REG, JSON.stringify(registry, null, 2));
}
