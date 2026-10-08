#!/usr/bin/env node
/**
 * ONE-OFF MIGRATION PIPELINE (already executed; kept for traceability).
 *
 * Regenerates CSS, templates and JSON content from the crawl cache (.cache/crawl).
 * WARNING: this overwrites data/ and src/ — any edit made by maintainers since the
 * migration would be lost. It therefore refuses to run without --force.
 *
 *   npm run crawl                       # 1. snapshot of the live site
 *   node scripts/import/run-all.mjs --force
 *       migrate-css      → src/css/*
 *       extract-meta     → data/<lang>/pages/*.json (meta)
 *       generate-page    → src/templates/pages/*, data/<lang>/pages/*.json (content)
 *       extract-training → data/<lang>/training-activities.json
 *       extract-research → data/<lang>/research-lines.json, data/people.json
 *       import-assets    → public/assets/*, public/wp-content/uploads/* (documents)
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PAGES } from '../../tests/helpers/pages.mjs';

if (!process.argv.includes('--force')) {
  console.error('This one-off migration overwrites data/ and src/. Re-run with --force if that is really intended.');
  process.exit(1);
}
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const run = (script, ...args) => { console.log(`\n▶ ${script} ${args.join(' ')}`); execFileSync(process.execPath, [path.join(dir, script), ...args], { stdio: 'inherit' }); };
run('migrate-css.mjs');
run('extract-meta.mjs');
for (const p of PAGES) run('generate-page.mjs', p.key);
run('extract-training.mjs');
run('extract-research.mjs');
run('import-assets.mjs');
