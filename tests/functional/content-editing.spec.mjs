// Proves that content is really edited through JSON: change a value, rebuild, check the
// page, restore the EXACT original file, rebuild, check again.
// The original bytes are restored in `finally` and in afterAll, even if the test fails.
// The site is rebuilt into a temporary folder (.cache/edit-test-dist), so dist/ and the
// other tests are not affected.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, ROOT } from '../helpers/fixtures.mjs';
import { build } from '../../scripts/build/build.mjs';
import { startServer } from '../../scripts/build/serve.mjs';

const MARK = 'STATIC-MIGRATION-TEST-12345';
const OUT = path.join(ROOT, '.cache', 'edit-test-dist');
const PORT = 4179;

// representative JSON-driven content: a page text, a shared entity, a collection record, global data
const CASES = [
  { name: 'page content (homepage strengths heading)', file: 'data/es/pages/home.json', url: '/', edit: (j) => { const old = j.content.strengths.heading.title; j.content.strengths.heading.title = MARK; return old; } },
  { name: 'shared entity (professor name in data/people.json)', file: 'data/people.json', url: '/investigacion/', edit: (j) => { const old = j.people[0].name; j.people[0].name = MARK; return old; } },
  { name: 'collection record (training activity title)', file: 'data/en/training-activities.json', url: '/language/en/training_activities/', edit: (j) => { const old = j.activities[0].title; j.activities[0].title = MARK; return old; } },
  { name: 'navigation label', file: 'data/navigation.json', url: '/contacto/', edit: (j) => { const old = j.es.items[0].label; j.es.items[0].label = MARK; return old; } },
];

test.describe.configure({ mode: 'serial' });
let server;
const originals = new Map();
test.beforeAll(async () => { server = await startServer({ port: PORT, dir: OUT }); });
test.afterAll(async () => {
  for (const [f, bytes] of originals) fs.writeFileSync(f, bytes); // safety net
  server?.close();
  fs.rmSync(OUT, { recursive: true, force: true });
});

for (const c of CASES) {
  test(`edit → rebuild → restore: ${c.name}`, async ({ page }) => {
    const file = path.join(ROOT, c.file);
    const original = fs.readFileSync(file);           // exact bytes
    originals.set(file, original);
    // textContent includes the content of hidden tabs (the edited record may be in a closed tab)
    const visible = async () => page.locator('body').evaluate((b) => b.textContent);
    let oldValue;
    try {
      const json = JSON.parse(original.toString('utf8'));
      oldValue = c.edit(json);
      fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
      await build({ outDir: OUT, quiet: true });
      await page.goto(`http://localhost:${PORT}${c.url}`);
      expect(await visible()).toContain(MARK);
    } finally {
      fs.writeFileSync(file, original);                // restore EXACT original contents
    }
    expect(fs.readFileSync(file).equals(original), 'file restored byte for byte').toBe(true);
    await build({ outDir: OUT, quiet: true });
    await page.goto(`http://localhost:${PORT}${c.url}`);
    const text = await visible();
    expect(text).not.toContain(MARK);
    expect(text.replace(/\s+/g, ' ')).toContain(oldValue.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  });
}

test('the original file is restored even when the check fails', async () => {
  const file = path.join(ROOT, 'data/es/pages/contacto.json');
  const original = fs.readFileSync(file);
  originals.set(file, original);
  const failingEdit = async () => {
    try {
      const json = JSON.parse(original.toString('utf8'));
      json.content.heading.title = MARK;
      fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
      throw new Error('simulated test failure after the edit');
    } finally {
      fs.writeFileSync(file, original);
    }
  };
  await expect(failingEdit()).rejects.toThrow('simulated test failure');
  expect(fs.readFileSync(file).equals(original)).toBe(true);
});

test('no test value is left in any JSON file', async () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(path.join(ROOT, 'data'))) expect(fs.readFileSync(f, 'utf8'), f).not.toContain(MARK);
});
