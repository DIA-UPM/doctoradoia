/**
 * Deployment under a sub-path (e.g. GitHub Pages project sites: https://<user>.github.io/<repo>/).
 *
 * Templates, CSS and content use root-relative URLs ("/assets/…", "/contacto/"). When the site
 * is built with a base path such as "/repo/", every root-relative URL in the generated HTML,
 * CSS, JS and JSON files of dist/ is prefixed with it. With the default base "/" nothing changes.
 */
import fs from 'node:fs';
import path from 'node:path';

export function normalizeBase(base) {
  if (!base || base === '/') return '/';
  return '/' + base.replace(/^\/+|\/+$/g, '') + '/';
}

const ATTRS = 'href|src|action|poster|data-vidbg-mp4|data-vidbg-poster';

/** prefixes root-relative URLs ("/x", not "//host") in one file's text */
export function rebaseText(text, ext, base) {
  const p = base.slice(0, -1); // "/repo"
  const fix = (u) => (u.startsWith('/') && !u.startsWith('//') && !u.startsWith(base) ? p + u : u);
  if (ext === '.css') return text.replace(/url\(\s*(['"]?)(\/[^'")]*)\1\s*\)/g, (m, q, u) => `url(${q}${fix(u)}${q})`);
  if (ext === '.json') return text.replace(/"url":"(\/[^"]*)"/g, (m, u) => `"url":"${fix(u)}"`);
  if (ext !== '.html') return text;
  return text
    .replace(new RegExp(`(\\s(?:${ATTRS})=)(["'])(\\/[^"']*)\\2`, 'g'), (m, a, q, u) => `${a}${q}${fix(u)}${q}`)
    .replace(/(\ssrcset=)(["'])([^"']*)\2/g, (m, a, q, v) => `${a}${q}${v.split(',').map((s) => { const [u, w] = s.trim().split(/\s+/); return [fix(u), w].filter(Boolean).join(' '); }).join(', ')}${q}`)
    .replace(/url\(\s*(['"]?)(\/[^'")]*)\1\s*\)/g, (m, q, u) => `url(${q}${fix(u)}${q})`) // inline styles
    .replace(/(content="\d+;\s*url=)(\/[^"]*)"/g, (m, a, u) => `${a}${fix(u)}"`) // meta refresh
    .replace(/location\.replace\("(\/[^"]*)"/g, (m, u) => `location.replace("${fix(u)}"`) // redirect pages
    // search configuration (JSON in a <script> tag)
    .replace(/<script id="site-search-config" type="application\/json">([^<]*)<\/script>/, (m, json) => {
      const cfg = JSON.parse(json);
      for (const k of ['index', 'css', 'homeUrl']) if (cfg[k]) cfg[k] = fix(cfg[k]);
      return `<script id="site-search-config" type="application/json">${JSON.stringify(cfg)}</script>`;
    })
    .replace(/(<script>if \(\/\[\?&\]s=\/\.test\(location\.search\)\) \{ var s = document\.createElement\('script'\); s\.src = ')(\/[^']*)'/, (m, a, u) => `${a}${fix(u)}'`);
}

export function rebaseDir(dir, base) {
  if (base === '/') return 0;
  let n = 0;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) return walk(f);
    const ext = path.extname(f).toLowerCase();
    if (!['.html', '.css', '.json'].includes(ext)) return;
    const t = fs.readFileSync(f, 'utf8');
    const r = rebaseText(t, ext, base);
    if (r !== t) { fs.writeFileSync(f, r); n++; }
  });
  walk(dir);
  return n;
}
