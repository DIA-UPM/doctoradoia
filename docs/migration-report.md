# Migration report — Doctorado en Inteligencia Artificial (UPM)

## Source

| | |
|---|---|
| Target website | https://doctoradoia.dia.fi.upm.es/ |
| Detected technology | WordPress 6.7.1 (multisite, site 8), PHP 8.4 / Apache; Astra 4.8.6 + Astra Pro + child theme; Gutenberg + Essential Blocks 5.0.4; Polylang (ES/EN); Yoast SEO; WP Fastest Cache; TablePress (+ DataTables); Video Background (jQuery); Elementor / HFE / Essential Addons installed but unused |
| Pages discovered | 20 public pages (10 ES + 10 EN) + WordPress system pages (404, search results) |
| Pages migrated | 20 / 20, same URLs; 404 (ES/EN) and search re-created |
| Assets migrated | 30 images + 2 flags, 1 video, 33 font files, 14 CSS background images (all in `public/`) |
| Documents migrated | 15 hosted documents (11 PDF, 3 XLSX, 1 ZIP) at their original URLs + 2 UPM regulation PDFs that were linked from upm.es, now self-hosted in `/documents/upm/`; 2 other UPM PDFs no longer exist at upm.es (links kept, see Known differences) |

## Migrated

- **Page types**: home (video hero), information pages with hero + tabs (objetivos, acceso, apoyo, tesis, información), research lines (tabs + professors), training activities (TablePress tabs + schedule), text page (comisiones), contact; plus 404 and search results.
- **Functionality**: responsive Astra header (921 px breakpoint), desktop dropdown (hover + keyboard), sticky slide-in header, off-canvas mobile menu with submenus, scroll-to-top, horizontal/vertical tabs, entrance animations (animate.css), background video (poster on mobile devices), language switch to the translation of the current page, `/language/en/` redirect, site search, 404 pages, SEO metadata, JSON-LD, hreflang, sitemaps, robots.txt.
- **Reusable components** (`src/templates`): base layout, header (desktop/sticky/mobile), menu macro (5 variants), mobile drawer, footer, icons, search form, research line, training activity table, training schedule, 404 template; Essential Blocks markup kept so the original CSS applies.

## Content model

| JSON | Controls |
|---|---|
| `data/site.json` | languages, site name, logos, header title, footer (address, map, copyright) |
| `data/navigation.json` | menus ES/EN (header, sticky, drawer, footer), language switch, menu UI labels |
| `data/<lang>/pages/<key>.json` | each page: URL, SEO meta, all texts/images/links of the page |
| `data/people.json` | 29 professors (shared by both languages) |
| `data/<lang>/research-lines.json` | 5 research lines → professors by id |
| `data/<lang>/training-activities.json` | 10 training activities (table rows) |
| `data/<lang>/system.json` | 404 and search texts |
| `data/redirects.json` | redirects kept from the original |

Relationships: page ↔ translation (same key), menu item → page key, research line → people ids.
A maintainer edits the JSON, runs `npm run dev` (live reload) or `npm run build`; the validator
reports the exact file/field if something is wrong. Details: [content-model.md](content-model.md), README.

## JavaScript

- **Retained libraries**: none (no jQuery, no CDN).
- **Removed**: jQuery + Migrate, Astra frontend, Astra Pro, Essential Blocks (tabs, navigation, animation loader), Essential Addons, Video Background, prettyPhoto/WP Video Lightbox, DataTables, DOMPurify, flexibility.js, WP emoji, Polylang cookie script, WP Fastest Cache bundles.
- **Re-implemented** (`src/js`, ≈19 KB): `header.js` (breakpoint, drawer, dropdown focus, sticky header, scroll-to-top), `tabs.js` (+ ARIA/keyboard), `animations.js`, `video-background.js`, `search.js`.
- Content stays readable with JavaScript disabled (all tab panels visible, animations only decorative).

## CMS dependencies

- Removed: everything under `/wp-admin/`, `/wp-json/`, `/wp-includes/`, `/wp-content/plugins|themes|cache/`, PHP, database. The link checker fails the build if any reappears.
- `/wp-content/uploads/sites/8/…` is kept **only** as the URL path of the 15 documents, so existing links to them keep working (plain files).
- Everything needed to render the site is local (fonts, images, video, CSS, JS, documents). The only remaining external dependency is the Google Maps iframe in the footer: an interactive Google map cannot be self-hosted, and a static screenshot would change the look and the behaviour, so it is kept. The CMS-independence test blocks every external host and all pages still render with CSS, fonts, images, video and JS.

## URLs

- Preserved: all 20 page URLs and all 15 document URLs; `robots.txt`, `sitemap_index.xml`, `wp-sitemap.xml`, `page-sitemap.xml`.
- Redirect required: `/language/en/` → `/language/en/overview/` (301, as on the original) — generated in `dist/.htaccess` (Apache), README snippet for nginx, HTML fallback page.
- Changed: content images moved from `/wp-content/uploads/…` to `/assets/images/…` (not linked from outside).
- Not migrated: RSS feeds, author archives, WordPress runtime endpoints.
- Broken/unreachable source URLs: none of the pages; see "Intentional deviations" and link-check-report.md. Full table: [url-migration.md](url-migration.md).

## Deployment

Static files only (`dist/`). Apache: generated `.htaccess`; nginx: README snippet; GitHub Pages: `.github/workflows/deploy.yml` + [despliegue-github-pages.md](despliegue-github-pages.md). The build takes `BASE_PATH`/`SITE_URL` from GitHub, so publishing first at `https://<user>.github.io/<repo>/` and later on a custom domain needs no code change.

## Testing (final run on 2026-10-07)

| Check | Result |
|---|---|
| JSON validation (`npm run validate`) | ✓ valid, 0 warnings |
| Production build | ✓ 20 pages + 2 × 404 + redirect page |
| Functional tests (Playwright, `npm test`) | ✓ **146 passed**, 0 failed — navigation, mobile menu, sticky header, language switch, every page (status, SEO, hreflang, images, fonts, console errors, failed requests, text identical to the original snapshot, documents), components, 404/search |
| Responsive tests | ✓ no horizontal overflow at 390/768/1024/1440/1920 px on any page |
| Visual regression (`npm run test:visual`) | ✓ 309 screenshots, 0 above threshold, 6 expected differences ([visual-regression.md](visual-regression.md)) |
| Broken internal links / missing assets / documents | ✓ 0 (2,487 references checked) |
| External links (`--external`) | 2 dead at the source (see below) |
| Console errors / JS exceptions / failed requests | ✓ none on any page (asserted in every page test) |
| JSON modification/restoration | ✓ 4 entity types edited → rebuilt → verified → restored byte-for-byte; restore also verified when the test fails; no test value left |
| Local-only / CMS-independence | ✓ all 20 pages + interactions with every external host blocked |
| Sub-path build (GitHub Pages project site, `npm run test:subpath`) | ✓ 20 pages, 83 internal URLs, menus, tabs, language switch, search, 404, redirect — 0 problems |
| Accessibility (axe-core, WCAG 2.1 AA, live vs local) | ✓ 0 rules worse than the live site, 2 better ([accessibility-report.md](accessibility-report.md)) |
| HTML validation (`npm run validate:html`) | 94 errors, all inherited from the original markup: duplicate ids/nested `<header>` of the Astra sticky header copy, label wrapping input + button in the Astra search form, duplicate anchor ids `objetivos` and `finalidad-del-programa` in the original content |

## Intentional deviations from the original

| Change | Original value | Why |
|---|---|---|
| Contact e-mail links (ES/EN, 3 links) | `href="doctorado.dia@fi.upm.es"` | → `mailto:doctorado.dia@fi.upm.es` (original led to a 404) |
| EN entry-requirements link | `https://www.upm.es/Estudiantes/Estudios_Titulaciones/Estudios_Doctorado/informacion )` | stray ` )` removed (404) |
| EN support page link | `https://www.upm.es/UPM/CompromisoSocial/UAD).` | stray `).` removed (404) |
| 2 UPM regulation PDFs (`Guia de buenas practicas junio 2017.pdf`, `Reglamento de Elaboración y Evaluacion de Tesis.pdf`) | linked to www.upm.es/sfs/… | self-hosted in `/documents/upm/` ("everything local") |
| Hot-linked images (8) | loaded from fi.upm.es, muia/dia.fi.upm.es, templately.com | self-hosted (the hosts were intermittently unavailable; confirmed by the site owner) |
| Search results | author line under each result | not reproduced (exposed editor user names) |
| Accessibility additions | — | ARIA tabs + arrow keys, Escape/focus handling in the mobile menu, focus outlines, iframe title, keyboard-focusable search field |
| Professor list markup | stray invisible links | normalised (visible text identical) |

Kept as on the original on purpose: `noindex, nofollow` on every page (remove `meta.robots` in the page JSON to allow indexing), the texts including typos, the H1 structure.

## Known differences

1. Training schedule table: column borders a few pixels off and 2 px shorter than the DataTables version (≤ 2.5 % of pixels).
2. Search results: no author line, no pagination, require JavaScript (the static `?s=` URL shows the home page without JS).
3. Polylang's language cookie is no longer set.
4. External links dead at their source (not changed): `http://sasover.com` (footer credit; domain no longer resolves), `https://www.upm.es/Estudiantes/EmpleoPracticas` (404), and the UPM PDFs `Requisitos acceso al doctorado RD992011.pdf` and `Modelo_Doctorado_RD_99_2011_UPM.pdf` (upm.es now answers with an HTML page; they could not be downloaded).
7. GitHub Pages: a single (Spanish) 404 page and an HTML (not HTTP 301) redirect for `/language/en/`.
5. On mobile devices the English home shows no poster image behind the hero (as on the original, which had none configured).
6. HTML validation issues inherited from the original markup (see Testing).
