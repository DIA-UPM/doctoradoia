# Site audit — https://doctoradoia.dia.fi.upm.es/

Audit of the live site carried out on 2026-10-07, before the migration. Sources:
crawler snapshot (`npm run crawl` → `.cache/crawl/`, summary in [crawl-report.md](crawl-report.md)),
rendered DOM in Chromium (Playwright), and the theme/plugin source files served by the site.

## 1. What exists

| Item | Finding |
|---|---|
| CMS | **WordPress 6.7.1**, multisite (this site is blog id 8: uploads under `/wp-content/uploads/sites/8/`), PHP 8.4, Apache |
| Theme | **Astra 4.8.6** + child theme `astra-child` + **Astra Pro (astra-addon) 4.8.6** (header/footer builder, sticky header, mega-menu CSS) |
| Page builder | **Gutenberg** with **Essential Blocks 5.0.4** (wrapper, row, column, advanced heading, info box, button, feature list, advanced image, advanced tabs, advanced navigation). Elementor 3.25.8 + Header Footer Elementor + Essential Addons are installed and load assets, but **no page uses Elementor widgets** |
| Other plugins | Yoast SEO 23.9 (meta, JSON-LD, sitemaps), Polylang (ES/EN, cookie `pll_language`), WP Fastest Cache (minified CSS/JS bundles in `/wp-content/cache/`), TablePress (tables on *Formación*), Video Background 2.7.7 (jQuery hero video), WP Video Lightbox / prettyPhoto (loaded, unused), PDF Embedder (CSS only, unused), WP emoji |
| Front-end libraries | jQuery 3.7.1 + jQuery Migrate, Font Awesome 5 (Essential Blocks + Elementor copies), eicons, dashicons, animate.css (Essential Blocks), hover.css, Swiper CSS (unused), DOMPurify, flexibility.js (IE polyfill) |
| Fonts | Google Fonts **Syne** (headings, menu, header title) and **Noto Sans Hanunoo** family name (body copy; Google serves the Noto Sans glyph subsets), Font Awesome 5 Solid/Regular |
| Languages | **Spanish** (default, `/`) and **English** (`/language/en/…`), Polylang; every page has a translation; `hreflang` alternates on every page |
| Pages | **20** public pages (10 ES + 10 EN). No posts, news, events, categories, archives or search results pages are linked or listed in the sitemap |
| Redirects | none for the 20 pages (all answer 200 directly) |
| Robots | every page carries `<meta name="robots" content="noindex, nofollow">` (WordPress "discourage search engines" setting), while `/robots.txt` allows everything and points to the Yoast sitemap. **Kept as is** (see *Important observations*) |
| Canonical / description | no `<link rel=canonical>` and no meta description on any page (Yoast disabled them because of noindex) |
| OpenGraph | `og:locale`, `og:locale:alternate`, `og:type`, `og:title`, `og:url`, `og:site_name`, `article:modified_time`, `og:image` (home) and `twitter:card`; Yoast JSON-LD graph (WebPage, BreadcrumbList, WebSite + SearchAction) |
| Favicon | SVG `logo-dia-actualizado.svg` (icon, apple-touch-icon, msapplication-TileImage) |
| Forms | **none** (no contact form, no search box, no login). See [dynamic-features.md](dynamic-features.md) |
| Embeds | Google Maps `<iframe>` in the footer (all pages) |
| Downloadable documents | 15 files hosted by the site (11 PDF, 3 XLSX, 1 ZIP) + 4 external PDFs (UPM, BOE). See [documents-inventory.md](documents-inventory.md) |
| External links | 107 distinct URLs incl. system pages (UPM, ETSIINF, Portal Científico, DIA staff pages, BOE, RUCT, Sasover) |
| Hot-linked third-party images | 8 images are loaded from other hosts: `www.fi.upm.es` (footer campus logo — intermittently unavailable during the audit), `muia.dia.fi.upm.es` (4 objective photos), `dia.fi.upm.es` (2 contact photos), `static.live.templately.com` (decorative background) |

## 2. Information architecture

```
/  Presentación (home)                          /language/en/overview/
├── Aspirantes  (menu group, no page)          Applicants
│   ├── /objetivos_competencias/                ├── /language/en/aims-competences-abilities-and-skills/
│   ├── /acceso_y_admision/                     ├── /language/en/entry-requirements/
│   ├── /apoyo_y_orientacion/                   ├── /language/en/student-support-and-guidance-systems/
│   └── /investigacion/                         └── /language/en/groups-and-lines-of-research/
├── /actividades_formativas/   Formación        /language/en/training_activities/
├── /tesis_doctoral/           Tesis            /language/en/phd_thesis/
├── /comision_academica/       Comisiones       /language/en/academic-commission/
├── /informacion/              + Info           /language/en/information/
└── /contacto/                 Contacto         /language/en/contact/
```

The same menu appears 5 times per page: desktop header, sticky header copy, off-canvas mobile
menu, off-canvas "desktop" menu (unused at these breakpoints) and the footer widget menu.
The language switcher is the last menu item (flag) and links to the translation of the current page.

## 3. Page types

| Type | Pages | Characteristics |
|---|---|---|
| **Home** | `/`, `/language/en/overview/` | Full-height hero with background video and the 5 research lines around the title (desktop); separate mobile hero; research-lines tabs (mobile only); "Cinco líneas" section with photo; "Finalidad" feature list; 7 "Fortalezas" info boxes in a staggered grid; "Historia" text. Entrance animations |
| **Hero + tabs (information page)** | objetivos, acceso, apoyo, tesis, informacion (+EN) | Hero row with background image and headings (sometimes button), vertical or horizontal tabs whose panels contain rich text, lists, images, file links |
| **Research lines** | investigacion (+EN) | Hero + vertical tabs, one per research line: description, topics list, list of professors (name → Portal Científico, "contacto" → personal page, category) |
| **Training activities** | actividades_formativas (+EN) | Hero + 10 numbered tabs, each a TablePress table describing one activity; schedule table (TablePress) |
| **Text page** | comision_academica (+EN) | Hero + rich text (headings, paragraphs, list, links to documents) |
| **Contact** | contacto (+EN) | Heading, directions text + photo, four contact cards |

## 4. Content types (recurring entities)

| Entity | Where | Recurs? | Migration |
|---|---|---|---|
| Page (meta + texts) | all | yes | `data/<lang>/pages/<key>.json` |
| Navigation menu | all pages ×5 | yes | `data/navigation.json` |
| Site settings: logos, programme title, footer address, map, copyright | all pages | yes | `data/site.json` |
| Research line | research page (5), home (titles/topics shown 3× with different line breaks) | yes | `data/<lang>/research-lines.json` (research page); home keeps its own presentation texts |
| Professor | research page (29 people, ES & EN identical) | yes, shared by both languages | `data/people.json`, referenced by id |
| Training activity | training page (10 tables) | yes | `data/<lang>/training-activities.json` |
| Training schedule | training page (1 table) | no | page JSON (`content.schedule`) |
| Programme objective / strength / feature | objetivos (5), home (7 + 2) | within one page | arrays in the page JSON |
| Document | informacion, comisiones, objetivos, tesis, formación | yes | files in `public/wp-content/uploads/…` (same URLs), inventory generated from the build |
| News, events, FAQs, courses, publications | — | **do not exist** on this site | none created |

## 5. Reusable visual components

Header (desktop / sticky / mobile), off-canvas drawer, footer (3 widget columns + copyright),
hero row (background image + eyebrow + title + subtitle [+ button]), Essential Blocks advanced
heading, info box (icon or image + title + text), feature list, advanced tabs (horizontal /
vertical, `data-min-height`), TablePress table, rich text (Gutenberg paragraphs, lists,
headings, images, file block), scroll-to-top button.

## 6. Features, implementing technology and decision

| Feature | Original implementation | Needs CMS? | Needs JS? | Decision |
|---|---|---|---|---|
| Responsive header, breakpoint 921 px (`ast-desktop` ⇄ `ast-header-break-point`) | Astra `frontend.min.js` (+ CSS media queries) | no | yes (class switch) | **Re-implemented** in `src/js/header.js` |
| Desktop dropdown (hover) | CSS | no | no | kept (CSS); keyboard `focus` class added by `header.js` |
| Off-canvas mobile menu with submenu toggles | Astra JS | no | yes | **Re-implemented** (`header.js`), same classes; Escape key and focus management added |
| Sticky "slide" header after scrolling (desktop only) | Astra Pro `astra-addon-*.js` + jQuery | no | yes | **Re-implemented** (`header.js`) |
| Scroll-to-top button | Astra JS | no | yes | **Re-implemented** (`header.js`) |
| Tabs (horizontal/vertical, min-height) | Essential Blocks `advanced-tabs/frontend.js` | no | yes | **Re-implemented** (`src/js/tabs.js`); ARIA roles + arrow keys added; without JS all panels stay visible |
| Entrance animations (fadeIn, fadeInUp, fadeInLeft/Right, slideInUp/Left, zoomIn) | Essential Blocks `eb-animation-load.js` + animate.css | no | yes (content visible without JS) | **Re-implemented** (`src/js/animations.js`); animate.css rules kept |
| Hero background video (muted loop; poster on mobile devices) | Video Background plugin `vidbg.min.js` + jQuery | no | yes | **Re-implemented** (`src/js/video-background.js`), video file self-hosted |
| Advanced navigation block in the footer | Essential Blocks (renders **empty**) | — | — | empty markup kept for spacing; its JS dropped |
| Video lightbox (prettyPhoto), Elementor frontend, Essential Addons, Swiper, DOMPurify, flexibility.js, emoji script, Polylang cookie script | plugins | — | — | **Removed**: loaded but not used by any page |
| TablePress tables | TablePress (static HTML); DataTables (jQuery) only on the schedule table, with ordering/paging/search disabled and `scrollX` on | no | no (the scroll wrapper was JS-generated) | HTML generated from JSON, TablePress CSS kept; the DataTables scroll wrapper is reproduced as static markup (CSS overflow, no JS) |
| SEO metadata, JSON-LD, sitemaps, robots.txt | Yoast | yes (generated) | no | Generated by the build from the page JSON |
| Language switching | Polylang | yes (URLs, links) | no | Static links between translations (`data/<lang>/pages/<key>.json` share the key) |
| Minified CSS/JS bundles | WP Fastest Cache | yes | — | CSS rebuilt from the **bundles actually served** (some are older than the theme/plugin files they come from), reorganised by origin and pruned with PurgeCSS; see §7 |
| Google Maps embed | iframe | no | (third party) | Kept as an intentional external dependency |
| Site search (`?s=`) | WordPress core (search form on the 404 page) | yes | — | Re-created client-side (`src/js/search.js` + build-time index), same URL and markup |
| 404 page | Astra template | yes | — | Static `404.html` per language |
| RSS feeds (`/feed/`), comments feed, author archives | WordPress core | yes | — | Not linked from any page; not migrated (documented in dynamic-features.md) |

## 7. CSS and JavaScript actually required

Each page loads 6 WP Fastest Cache bundles (≈1.26 MB on the home page) that concatenate
30 theme/plugin stylesheets (+ 2 Google Fonts stylesheets and 10 inline `<style>` blocks).
The cache plugin keeps the `<link>` tags of the original files in HTML comments, but **the
bundles are partly stale**: e.g. some per-post Essential Blocks rules are HTML-escaped (and
therefore ignored by browsers) in some bundles and valid in others, and some original files
contain rules the served bundles do not. `scripts/import/migrate-css.mjs` therefore uses the
served bundles as the source of truth (dropping the rules browsers drop), uses the original
files only to sort each rule into a file by origin, splits shared from page-specific rules and
removes every selector that never matches the rendered pages (PurgeCSS, with a safelist for
classes added by JavaScript and a workaround for `:where(:not(…))` selectors).
Result: `src/css/{fonts,variables,theme,blocks,custom,static}.css` (≈370 KB, shared and cached) +
one file per page and language (7–89 KB, Essential Blocks per-post styles).

JavaScript: **none of the 20 original scripts is used**. 5 small standalone files (≈19 KB in total,
no dependencies) reproduce the behaviours listed above, plus the search.

## 8. Assets

- Images used by content and layout: 30 files in `public/assets/images/` (+ 2 language flags extracted from inline data URIs), including the 8 images that were hot-linked from other hosts (self-hosted now so the site does not depend on those hosts; self-hosting confirmed by the owner).
- Background video: 1 MP4 (4 MB) — `public/assets/video/`.
- Fonts: 33 files (Syne, Noto Sans subsets, Font Awesome, TablePress icons, dashicons/eicons only where referenced by kept rules).
- Documents: 15 files at their original URLs.
- CSS background images: 14 files (hero backgrounds, footer background, decorative shapes).

## 9. Important observations about the original site

1. **All pages are `noindex, nofollow`** although robots.txt and the sitemap invite crawling. This looks like the WordPress "discourage search engines" option left on. The migration keeps it unchanged (`meta.robots` in each page JSON) — remove it there if the site should be indexed.
2. The header renders the programme title as an `<h1>` (twice: header and sticky copy), and most pages use one or two more `<h1>` in their hero. Kept as on the original; the sticky copy is hidden from assistive technology until it is shown.
3. The e-mail link on the contact page has no `mailto:` (`href="doctorado.dia@fi.upm.es"`) and leads to a 404, and two English links to upm.es contain a stray `)`. These three were **fixed** in the JSON (see migration-report.md, "Intentional deviations").
4. Some professor list items contain stray, invisible links (a space linking to another person's profile). These were normalised in the structured data (`data/people.json`); visible text is unchanged.
5. The footer campus logo is hot-linked from `www.fi.upm.es`, which did not answer during part of the audit (the live baseline screenshots show the broken image). It is self-hosted in the migrated site.
6. Some texts contain small typos (e.g. "Objetiv0 1" on the Spanish objectives page, "Taleres" in the training schedule); content was **not** corrected.
7. The live server answered slowly and often timed out during the audit (a page request every few seconds was enough), and the UPM servers hosting staff pages throttled repeated requests.
