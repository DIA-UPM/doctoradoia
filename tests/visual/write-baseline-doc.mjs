#!/usr/bin/env node
/** Writes docs/visual-baseline.md from tests/reference/index.json (written by npm run baseline). */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'reference', 'index.json'), 'utf8'));
const STATES = {
  full: 'full page (entrance animations in final state, video paused on first frame)',
  top: 'first screen',
  dropdown: '"Aspirantes" dropdown open (hover)',
  sticky: 'sticky header after scrolling 900 px',
  'menu-open': 'mobile off-canvas menu open',
  tab2: 'second tab selected',
};
const groups = new Map();
for (const e of index) {
  const k = `${e.key}|${e.lang}`;
  if (!groups.has(k)) groups.set(k, { ...e, shots: [] });
  groups.get(k).shots.push(...e.files.map((f) => ({ f, vp: e.viewport, missing: e.missingResources })));
}
let md = `# Visual baseline\n\nScreenshots of the **live site** taken with Playwright/Chromium by \`npm run baseline\` (tests/visual/capture-baseline.mjs) and stored in \`tests/reference/\`. Viewports: 1920×1080, 1440×900, 1024×768, 768×1024, 390×844 (system pages: 1440 and 390).\n\nBefore every screenshot the page is scrolled to the bottom (lazy images, scroll animations), entrance animations are forced to their final state, CSS transitions are disabled, the hero video is paused on its first frame and fonts/images are awaited. A capture is accepted only when every image, font, stylesheet and script loaded (up to 4 attempts); pages captured with missing resources are flagged below.\n\nStates: ${Object.entries(STATES).map(([k, v]) => `\`${k}\` = ${v}`).join('; ')}.\n\n`;
md += '| Page | Page type | Original URL | Screenshots | Interactive states | Missing resources at capture |\n|---|---|---|---|---|---|\n';
for (const g of groups.values()) {
  const states = [...new Set(g.shots.map((s) => s.f.split('-').at(-1).replace('.png', '')))].filter((s) => !['full', 'top'].includes(s));
  const missing = [...new Set(index.filter((e) => e.key === g.key && e.lang === g.lang).flatMap((e) => e.missingResources || []))];
  md += `| ${g.key} (${g.lang}) | ${g.type} | ${g.url} | ${g.shots.length} (\`${g.key}-${g.lang}-<viewport>-<state>.png\`) | ${states.join(', ') || '—'} | ${missing.length ? missing.map((m) => m.replace(/^https?:\/\//, '')).join('<br>') : 'none'} |\n`;
}
md += `\nTotal: ${index.reduce((n, e) => n + e.files.length, 0)} screenshots.\n`;
fs.writeFileSync(path.join(ROOT, 'docs', 'visual-baseline.md'), md);
console.log('docs/visual-baseline.md written');
