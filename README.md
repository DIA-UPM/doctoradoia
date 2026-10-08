# Doctorado en Inteligencia Artificial — static website

Static HTML/CSS/JavaScript version of **https://doctoradoia.dia.fi.upm.es/** (previously
WordPress + Astra + Essential Blocks). The pages look and behave like the original, keep the
same URLs, and all texts are edited in **JSON files**. The result is a folder of plain files
(`dist/`) that any web server can publish: nginx, Apache, GitHub Pages…

- Audit of the original site: [docs/site-audit.md](docs/site-audit.md)
- Content model (which JSON controls what): [docs/content-model.md](docs/content-model.md)
- URLs: [docs/url-migration.md](docs/url-migration.md) · Documents: [docs/documents-inventory.md](docs/documents-inventory.md)
- Server-side features: [docs/dynamic-features.md](docs/dynamic-features.md)
- Visual baseline and comparison: [docs/visual-baseline.md](docs/visual-baseline.md), [docs/visual-regression.md](docs/visual-regression.md)
- Final migration report: [docs/migration-report.md](docs/migration-report.md)

## Architecture

```
data/*.json  ──►  scripts/build/build.mjs (Nunjucks)  ──►  dist/  (static HTML + assets)
                     ▲              ▲
     src/templates/*.njk     src/css, src/js, public/
```

| Folder | Contents |
|---|---|
| `data/` | **All the content** (JSON). See below |
| `schemas/` | JSON schemas used by the validator |
| `src/templates/` | Nunjucks templates: `layouts/base.njk`, `partials/` (header, menu, footer, mobile drawer, icons, search form), `components/` (research line, training tables), `pages/` (one per page type), `special/404.njk` |
| `src/css/` | Styles migrated from the original theme/plugins and pruned: `fonts.css`, `variables.css` (colour/size tokens), `theme.css` (header, menus, footer, layout), `blocks.css` (content blocks, tabs, info boxes, animations), `custom.css` (site customisations), `static.css` (additions of this project), `pages/*.css` (per-page block styles) |
| `src/js/` | Small dependency-free scripts: `header.js` (responsive header, mobile drawer, sticky header, scroll-to-top), `tabs.js`, `animations.js`, `video-background.js`, `search.js` |
| `public/` | Files copied as-is: `assets/images`, `assets/fonts`, `assets/video`, documents in `wp-content/uploads/…` (original URLs kept) |
| `scripts/build/` | `build.mjs` (build), `dev.mjs` (dev server + live reload), `serve.mjs` (static server), `data.mjs`, `navigation.mjs` |
| `scripts/validation/` | `validate.mjs` (JSON), `check-links.mjs`, inventories (documents, URLs), `allowlist.json` (known issues of the original site) |
| `scripts/crawl/` | `crawl.mjs`: snapshot of the live site (Playwright) |
| `scripts/import/` | One-off migration tools that produced `src/` and `data/` from the snapshot (kept for traceability, not used by the build) |
| `tests/` | `functional/` (Playwright), `visual/` (baseline capture + visual regression), `reference/` (screenshots of the live site), `helpers/` |
| `docs/` | Audit, model, inventories, reports |

The browser receives plain HTML with all text already in it; JavaScript only adds behaviour
(and pages remain readable without it). No jQuery, no CMS, no CDN; the only third-party
request is the Google Maps iframe in the footer.

## Prerequisites

- **Node.js 20 or newer** (developed with Node 24 LTS) and npm.
  On the original development machine a portable Node is in `.tools/node` (not versioned);
  a normal Node.js LTS installation works the same.
- Playwright's Chromium for tests and the crawler: `npx playwright install chromium`.

## Installation

```bash
npm install
npx playwright install chromium
```

## Everyday use

| Command | What it does |
|---|---|
| `npm run dev` | Builds, serves on http://localhost:8080 and rebuilds + reloads the browser on every change in `data/`, `src/` or `public/`. Content errors appear in the terminal and in the browser |
| `npm run build` | Validates the JSON and writes the production site to `dist/` |
| `npm run serve` | Serves `dist/` on http://localhost:8080 (like nginx would) |
| `npm run validate` | Checks all JSON (syntax, schemas, duplicate ids, cross-references, links, images, documents) |
| `npm run check-links` | Checks every link/asset of `dist/` (add `-- --external` to also test external links) |
| `npm test` | validate + build + link check + all Playwright functional tests |
| `npm run test:visual` | Compares the local site with the screenshots of the live site |
| `npm run test:a11y` | axe-core accessibility comparison, live site vs local build |
| `npm run test:subpath` | Builds for a sub-path (`/doctoradoia-test/`, like GitHub Pages) and checks every page offline |
| `npm run validate:html` | HTML validation of `dist/` |
| `npm run baseline` | (Re)captures the live-site screenshots into `tests/reference/` |
| `npm run crawl` | Snapshot of the live site into `.cache/crawl/` (cached, polite) |
| `npm run docs:documents`, `npm run docs:urls` | Regenerate the inventories in `docs/` |

## Editing content

1. Find the JSON file (table below or [docs/content-model.md](docs/content-model.md)).
2. Change the text. Keep the quotes and commas of JSON; text fields may contain HTML (`<strong>`, `<br>`, `<a href="…">`).
3. Run `npm run dev` (or `npm run build`) and check the page.

| I want to change… | File |
|---|---|
| A text of a page | `data/<lang>/pages/<page>.json` → `content` |
| Page title / SEO | same file → `meta` |
| The menu | `data/navigation.json` |
| Footer address, logos, copyright, map | `data/site.json` → `footer` |
| A research line (description, topics, list of professors) | `data/<lang>/research-lines.json` |
| A professor's name, links or category | `data/people.json` (affects both languages) |
| A training activity table | `data/<lang>/training-activities.json` |
| The training schedule | `data/<lang>/pages/formacion.json` → `content.schedule.rows` |
| 404 / search texts | `data/<lang>/system.json` |

Pages: `home` (Presentación), `objetivos`, `acceso`, `apoyo`, `investigacion`, `formacion`,
`tesis`, `comisiones`, `informacion`, `contacto` — in `data/es/pages/` and `data/en/pages/`.

**Images and documents**: put the file in `public/assets/images/` (images) or
`public/wp-content/uploads/sites/8/<year>/<month>/` (documents, to follow the existing URLs),
then reference it with a path starting with `/` (e.g. `"/assets/images/photo.jpg"`).
The validator stops the build if the file does not exist.

If the JSON is wrong the build stops and says where, e.g.:

```
✗ data/es/research-lines.json → lines[2].professors[1]: "garcia-xx" does not exist in data/people.json
✗ data/es/pages/home.json: malformed JSON (line 12, column 5): Expected ',' or '}' after property value
```

## Adding pages

1. Create `data/es/pages/<key>.json` (and `data/en/pages/<key>.json` for the translation) with
   `path`, `wordpressId` (any unused number), `meta.title` and `content`. Copy an existing page
   of the same type as a starting point.
2. Create the template `src/templates/pages/<key>.njk` (copy the template of a similar page and
   adapt it; it must `{% extends "layouts/base.njk" %}` and fill `{% block content %}`).
   Optionally add page styles in `src/css/pages/<key>.css`.
3. Add it to the menu in `data/navigation.json` (`{ "id": <unique number>, "label": "…", "page": "<key>" }`).
4. `npm run build` — the page, its sitemap entry, hreflang links and search entry are generated.
   Add the page to `tests/helpers/pages.mjs` if it should be part of the visual tests.

## Adding recurring entities

- **Professor**: add `{ "id", "name", "portalUrl", "contactUrl", "category" }` to
  `data/people.json`, then add the `id` to `professors` of the research line(s).
- **Research line**: add a record to `lines` in both `data/<lang>/research-lines.json`; a new tab
  appears automatically (styles of the existing tabs are reused in turn).
- **Training activity**: add a record to `activities` in both languages with a new unique
  `tableId`; a new numbered tab appears.
- **Menu item**: add it to `items` (or `children`) in `data/navigation.json`.
- **Items of fixed layouts** (home "Fortalezas" boxes, the 5 objectives, contact cards): the
  number of boxes is defined by the template, because every box has its own styling on the
  original design. To add one, duplicate a box in the template and give it the next array index.

## Testing

```bash
npm test               # JSON validation, build, link/asset check, Playwright functional tests
npm run test:visual    # visual comparison with tests/reference (live site)
```

Functional tests (`tests/functional/`): navigation (desktop, dropdown, sticky header, mobile
drawer, language switch, skip link), every page (status, metadata, hreflang, images, fonts,
console errors, failed requests, horizontal overflow at 390–1920 px, documents, text identical
to the original snapshot), components (home sections, research lines, professors, training
tables, tabs + keyboard, animations, video, no-JS rendering), 404 and search, **JSON editing**
(changes a JSON value, rebuilds, checks the page, restores the exact original file — also on
failure) and **CMS independence** (all external hosts blocked).

## Deployment

Copy the **contents of `dist/`** to the web root. Requirements: serve `index.html` for
directories, and use the 404 pages.

**Apache**: nothing to do — the build writes `dist/.htaccess` (404 pages and the
`/language/en/` redirect). `AllowOverride FileInfo` (or equivalent) must be enabled.

**nginx**:

```nginx
server {
    root /var/www/doctoradoia/dist;
    index index.html;
    location = /language/en/ { return 301 /language/en/overview/$is_args$args; }
    location /language/en/ { try_files $uri $uri/ =404; error_page 404 /language/en/404.html; }
    location / { try_files $uri $uri/ =404; }
    error_page 404 /404.html;
}
```

### Deploying to GitHub Pages

The repository contains `.github/workflows/deploy.yml`: on every push to `main` it runs
`npm ci`, `npm run validate`, `npm run build`, `npm run check-links` and publishes `dist/` with
`actions/deploy-pages`. Step-by-step guide (in Spanish, including upload from the GitHub
website): [docs/despliegue-github-pages.md](docs/despliegue-github-pages.md).

1. Create the repository on GitHub and upload/push the project (`.gitignore` already excludes
   `node_modules`, `.tools`, `.cache`, `dist` and the 245 MB of reference screenshots).
2. Settings → Pages → Source: **GitHub Actions**. The workflow runs and the site appears at
   `https://<user>.github.io/<repo>/`.
3. **Custom domain** (no code/JSON change): Settings → Pages → Custom domain + DNS records
   (CNAME to `<user>.github.io` for a subdomain; A/AAAA records to GitHub Pages for an apex
   domain) → Enforce HTTPS → re-run the workflow. No `CNAME` file is needed with the Actions source.

How it works: `actions/configure-pages` gives the build the public URL; the workflow passes
it as `BASE_PATH` (e.g. `/repo/`, empty with a custom domain) and `SITE_URL`. The build then
prefixes every root-relative URL (pages, assets, search index, redirects) with the base path and
uses `SITE_URL` for canonical/OpenGraph/hreflang/sitemaps. Locally the default is the root.
Test a sub-path build with `npm run test:subpath` or build one with
`BASE_PATH=/repo/ npm run build`.

On GitHub Pages `.htaccess` is ignored: `/404.html` (Spanish) is used for every unknown URL,
and `/language/en/` redirects through its HTML fallback page.

**Other static hosts**: upload the contents of `dist/` (build with `BASE_PATH` if the site is
not at the root of its domain).

## Crawler (snapshot of the original site)

`npm run crawl` renders every page of the live site with Chromium, follows internal links,
records every network request, scans `src`/`srcset`/`data-src`/CSS `url()`/the original files
hidden by the cache plugin, downloads what is needed into `.cache/crawl/files` (never twice;
`-- --refresh` forces it), waits 300 ms between downloads and writes `.cache/crawl/report.json`
and [docs/crawl-report.md](docs/crawl-report.md) (pages, resources by class, redirects,
failures, duplicates, external links). The snapshot is only needed to re-run the migration
tools or the text-parity test; the site itself never uses it.

## One-off migration tools

`scripts/import/` contains the tools that generated the CSS, templates and JSON from the
snapshot (`run-all.mjs` documents the order). They overwrite `src/` and `data/`, so they are not
part of the normal workflow and refuse to run without `--force`.
