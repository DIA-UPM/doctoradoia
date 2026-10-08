#!/usr/bin/env node
/**
 * ONE-OFF MIGRATION TOOL: turns the TablePress tables of the "Formación" page
 * (already extracted as HTML by generate-page.mjs) into structured JSON:
 *   - data/<lang>/training-activities.json  one record per training activity
 *   - data/<lang>/pages/formacion.json       content.schedule {intro, columns, rows}
 * Run after `node scripts/import/generate-page.mjs formacion`.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 60).replace(/^-|-$/g, '');
const cell = ($, el) => $(el).html().trim();

for (const lang of ['es', 'en']) {
  const pageFile = path.join(ROOT, 'data', lang, 'pages', 'formacion.json');
  const page = JSON.parse(fs.readFileSync(pageFile, 'utf8'));
  const c = page.content;
  const activities = c.activityTabs.panels.map((panel, i) => {
    const $ = cheerio.load(panel.body, { decodeEntities: false }, false);
    const table = $('table');
    const rows = [];
    let title = null;
    table.find('tr').each((_, tr) => {
      const tds = $(tr).children('td');
      if (tds.length === 1 && $(tds[0]).attr('colspan') === '2' && title === null) { title = cell($, tds[0]); return; }
      if (tds.length === 2) rows.push({ label: cell($, tds[0]), values: [cell($, tds[1])] });
      else if (tds.length === 1) rows.at(-1).values.push(cell($, tds[0])); // continuation of a rowspan
    });
    return { slug: slug(title), title, tableId: Number(table.attr('id').replace('tablepress-', '')), details: rows };
  });
  const collection = {
    description: lang === 'es' ? 'Actividades formativas del programa (página Formación). Cada actividad se muestra en una pestaña numerada, en este orden.' : 'Training activities of the programme (Training page). Each activity is shown in a numbered tab, in this order.',
    activities,
  };
  fs.writeFileSync(path.join(ROOT, 'data', lang, 'training-activities.json'), JSON.stringify(collection, null, 2) + '\n');

  // schedule table
  const $ = cheerio.load(c.schedule.body, { decodeEntities: false }, false);
  const table = $('table');
  const intro = [];
  table.prevAll().toArray().reverse().forEach((el) => intro.push($.html(el)));
  const after = table.nextAll().toArray().map((el) => $.html(el)).join('\n');
  c.schedule = {
    intro: intro.join('\n'),
    tableId: Number(table.attr('id').replace('tablepress-', '')),
    columns: table.find('thead th').toArray().map((th) => cell($, th)),
    rows: table.find('tbody tr').toArray().map((tr) => $(tr).children('td').toArray().map((td) => cell($, td))),
    ...(after.trim() ? { after } : {}),
  };
  c.activityTabs = {}; // tab labels are the activity numbers, generated from the collection
  delete c.activityTabs;
  fs.writeFileSync(pageFile, JSON.stringify(page, null, 2) + '\n');
  console.log(lang, activities.length, 'activities;', c.schedule.rows.length, 'schedule rows');
}
