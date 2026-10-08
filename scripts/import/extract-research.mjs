#!/usr/bin/env node
/**
 * ONE-OFF MIGRATION TOOL: turns the five research-line tabs of the "Investigación" page
 * into structured data:
 *   - data/people.json                       professors (language independent)
 *   - data/<lang>/research-lines.json        the research lines, referencing people by id
 *   - data/<lang>/pages/investigacion.json   keeps only the page-level texts
 * Every line follows the same pattern on the original site:
 *   description paragraphs, "Temas de investigación:" + list, "Profesores ...:" + list
 * The script stops if a tab does not follow it, so nothing is silently dropped.
 * Run after `node scripts/import/generate-page.mjs investigacion`.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const PANELS = ['g4hv7vx', 'a45r5r0', '07ss307', '6ubd7yn', 'qg8s2ak'];
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const people = new Map();

for (const lang of ['es', 'en']) {
  const pageFile = path.join(ROOT, 'data', lang, 'pages', 'investigacion.json');
  const page = JSON.parse(fs.readFileSync(pageFile, 'utf8'));
  const blocks = page.content.blocks;
  const tabs = blocks.cg12jgf.tabs;
  const lines = PANELS.map((id, i) => {
    const $ = cheerio.load(blocks[id].body, { decodeEntities: false }, false);
    const kids = $.root().children().toArray();
    const lists = kids.map((k, j) => (k.tagName === 'ul' ? j : -1)).filter((j) => j >= 0);
    if (lists.length !== 2) throw new Error(`${lang} line ${i + 1}: expected 2 lists, found ${lists.length}`);
    const [topicsIdx, profIdx] = lists;
    const topicsLabel = $.html(kids[topicsIdx - 1]);
    const profLabel = $.html(kids[profIdx - 1]);
    const description = kids.slice(0, topicsIdx - 1).map((k) => $.html(k)).join('\n');
    const between = kids.slice(topicsIdx + 1, profIdx - 1);
    const after = kids.slice(profIdx + 1);
    if (between.length || after.length) throw new Error(`${lang} line ${i + 1}: unexpected content around the lists`);
    const topics = $(kids[topicsIdx]).children('li').toArray().map((li) => $(li).html().trim());
    const professors = $(kids[profIdx]).children('li').toArray().map((li) => {
      const links = $(li).find('a').toArray();
      const portal = links.find((a) => /portalcientifico/.test($(a).attr('href')) && $(a).text().trim());
      const contact = links.find((a) => /personaldia/.test($(a).attr('href')));
      const text = $(li).text().replace(/\s+/g, ' ').trim();
      const category = (text.match(/\(([A-Z]{2,4})\)\s*$/) || [])[1] || null;
      const name = $(portal).text().trim();
      const id = slugify(name);
      const record = { id, name, portalUrl: $(portal).attr('href'), contactUrl: contact ? $(contact).attr('href') : null, category };
      const prev = people.get(id);
      if (prev && JSON.stringify(prev) !== JSON.stringify(record)) console.warn('  ! person differs between pages/languages:', id, prev, record);
      if (!prev) people.set(id, record);
      return { id, contactLabel: contact ? $(contact).text() : null };
    });
    const contactLabel = professors.find((p) => p.contactLabel)?.contactLabel;
    return {
      slug: slugify(tabs[i].replace(/<[^>]+>/g, '').replace(/^[^:]*:\s*/, '')),
      number: i + 1,
      tabTitle: tabs[i],
      description,
      // headings are kept per line: their markup differs slightly between lines on the original site
      topicsHeading: topicsLabel,
      topics,
      professorsHeading: profLabel,
      professors: professors.map((p) => p.id),
      contactLabel,
    };
  });
  fs.writeFileSync(path.join(ROOT, 'data', lang, 'research-lines.json'), JSON.stringify({
    description: lang === 'es' ? 'Líneas/equipos de investigación (página Investigación). Los profesores se referencian por su id en data/people.json.' : 'Research lines/groups (Research page). Professors are referenced by their id in data/people.json.',
    lines,
  }, null, 2) + '\n');
  // page JSON keeps the hero only
  page.content = { hero: { eyebrow: blocks.phz4e97, ...blocks.whm5l2i } };
  fs.writeFileSync(pageFile, JSON.stringify(page, null, 2) + '\n');
  console.log(lang, lines.length, 'lines', lines.map((l) => l.professors.length).join('/'), 'professors');
}
const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
fs.writeFileSync(path.join(ROOT, 'data', 'people.json'), JSON.stringify({
  description: 'Profesores investigadores del programa (doctores). Categoría: CU = Catedrático/a de Universidad, TU = Titular de Universidad, tal como aparece en la web original. Se referencian por "id" desde data/<lang>/research-lines.json.',
  people: list,
}, null, 2) + '\n');
console.log(list.length, 'people');
