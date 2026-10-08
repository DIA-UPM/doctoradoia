# Content model

The model was derived from the 20 pages of the original site (see [site-audit.md](site-audit.md) §4).
Only entities that really recur on the site became collections; everything else is a field
of the page that shows it. Every JSON file has a schema in `schemas/` and is checked by
`npm run validate` (also run by every build).

```
data/
├── site.json                    global settings, header, footer          → schemas/site.schema.json
├── navigation.json              main menu ES/EN                          → schemas/navigation.schema.json
├── people.json                  professors (shared by both languages)    → schemas/people.schema.json
├── redirects.json               redirects kept from the original site
├── es/                          Spanish
│   ├── pages/<key>.json         one file per page                        → schemas/page.schema.json
│   ├── research-lines.json      research lines/groups                    → schemas/research-lines.schema.json
│   ├── training-activities.json training activities                      → schemas/training-activities.schema.json
│   └── system.json              404 page and search texts                → schemas/system.schema.json
└── en/                          English (same files, same keys)
```

## Conventions

- **Language**: one folder per language; a page and its translation share the same file name
  (`<key>`). The key links the translations (language switcher, `hreflang`) and selects the
  template `src/templates/pages/<key>.njk` (or `<key>.<lang>.njk` when the two languages have
  slightly different markup on the original site).
- **Rich text** fields contain HTML exactly as on the original site (`<strong>`, `<br>`,
  `<a>`, `<p>`, `<ul>`…). Field names ending in `body`, `text`, `description`, `intro`,
  `subtitle` usually contain HTML.
- **Links**: internal pages and documents use root-relative paths (`/contacto/`,
  `/wp-content/uploads/sites/8/…pdf`); images live in `/assets/images/`. The validator
  checks that every one of them exists.
- **Identifiers**: readable, stable slugs (`metodologia-de-la-investigacion`,
  `garcia-cuesta-esteban`). Numbers such as `wordpressId`, menu `id` or `tableId` are the
  original WordPress ids, kept because the migrated CSS uses them in class names.
- **Arrays with a fixed layout**: some arrays fill a layout with a fixed number of styled
  slots (e.g. the 7 "Fortalezas" boxes of the home page, each with its own colour). The
  template shows as many items as it has slots; adding items there requires a template
  change (see README → "Adding recurring entities"). Real collections (research lines,
  professors, training activities, menu items) grow freely.

## Entities

### Site (`data/site.json`, single object)
| Field | Req. | Description |
|---|---|---|
| `siteUrl` | yes | Public origin (OpenGraph, hreflang, sitemaps) |
| `defaultLanguage`, `languages[]` | yes | `code`, `pathPrefix` (`/`, `/language/en/`), `locale`, `htmlLang`, `hreflang`, `name`, `flag` |
| `siteName`, `siteDescription` | yes | per language |
| `favicon` | yes | |
| `header.logo`, `header.programmeTitle` | yes | logo of the transparent header; text of the header H1 |
| `footer.*` | yes | logos, address lines, Google Maps embed URL and title, copyright (`{year}`), "Powered by" link |

### Navigation (`data/navigation.json`, one menu per language)
`items[]`: `{ id, label, page | url, children[] }` — `page` is a page key. Also the UI labels
of the menus (aria labels, "Main Menu", skip link…), the footer widget title and the language
switch (`languageSwitcher.language`). Cross-reference: every `page` must exist in that language.

### Page (`data/<lang>/pages/<key>.json`, one file per page and language)
| Field | Req. | Description |
|---|---|---|
| `path` | yes | URL path, identical to the original (`/acceso_y_admision/`) |
| `wordpressId` | yes | original post id (CSS hooks `page-id-N`, `post-N`) |
| `isHome` | | home page of the language |
| `entryTitle` | | visible WordPress page title (only "Contacto") |
| `meta.title` | yes | `<title>`, og:title |
| `meta.robots` | | `"noindex, nofollow"` on all pages (as on the original) |
| `meta.ogType`, `meta.ogImage`, `meta.published`, `meta.modified`, `meta.breadcrumb` | | SEO / JSON-LD |
| `sourceUrl` | | original URL (informative) |
| `content` | yes | texts of the page, structure depends on the page type (below) |

Content by page type (`es` shown; `en` has the same structure):

| Page (key) | `content` fields |
|---|---|
| Home (`home`) | `hero` {`programme`, `intro`, `places`, `researchLines[5]` (title + topics around the sphere), `video`, `videoPoster`}, `heroMobile` {`programme`, `places`, `intro`}, `researchTabs` {`heading`, `tabs[5]`, `lines[5]`}, `researchIntro` {`heading`, `image`, `imageAlt`, `text`}, `purpose` {`heading`, `items[2]` {title, text}}, `strengths` {`heading`, `items[7]` {title, description}}, `history` {`heading`, `body`} |
| Objectives (`objetivos`) | `hero` {`eyebrow`, `title`, `subtitle`, `button` {url, label}}, `objectives` {`heading`, `items[5]` {image, imageAlt, title, description}}, `competences` {`tabs[3]`, `panels[3].body`} |
| Admission (`acceso`) | `hero` {`title`, `subtitle`, `intro`}, `steps[5]` {title, subtitle, body} (desktop), `stepsMobile[5]` (mobile copy, ES only), `details` {`tabs[5]`, `panels[5]` {body, capacities, priorKnowledge}} |
| Support (`apoyo`) | `hero` {`title`, `subtitle`, `intro`}, `sections` {`tabs[5]`, `panels[5].body`} |
| Research (`investigacion`) | `hero` {`eyebrow`, `title`, `subtitle`} — the tabs come from **research-lines.json** |
| Training (`formacion`) | `hero`, `intro`, `schedule` {`intro`, `tableId`, `columns[]`, `rows[][]`} — the tabs come from **training-activities.json** |
| Thesis (`tesis`) | `hero`, `steps` {`tabs[4]`, `panels[4].body`} |
| Committees (`comisiones`) | `hero`, `main.body` |
| More info (`informacion`) | `hero`, `resources` {`tabs[5]` (two tabs are links), `panels[3].body`} |
| Contact (`contacto`) | `heading`, `directions` {`body`, `image`, `imageAlt`}, `contacts[4].body` |

"Heading" objects (`{title, subtitle}`) correspond to the Essential Blocks heading of the
original page; an empty string keeps an element that was empty on the original.

### Research line (`data/<lang>/research-lines.json` → `lines[]`, collection)
| Field | Req. | Description |
|---|---|---|
| `slug` | yes | stable id (`applications-of-artificial-intelligence`) |
| `number` | yes | order/number of the line |
| `tabTitle` | yes | tab label (HTML) |
| `description` | yes | HTML paragraphs |
| `topicsHeading`, `topics[]` | yes | heading + list of research topics |
| `professorsHeading`, `professors[]` | yes | heading + **ids of `data/people.json`** |
| `contactLabel` | yes | text of the personal-page link ("contacto"/"contact") |

Relationship: line → professors (many-to-many by id). Rendered on the research page; the
home page shows its own shorter texts about the lines (they differ from these on the original).

### Person (`data/people.json` → `people[]`, collection shared by both languages)
`id` (slug of the name, required), `name` (required, "Surnames, Name"), `portalUrl`
(UPM Portal Científico, required), `contactUrl` (personal page), `category` (CU, TU, AD, PPL…).
Changing a person updates both languages and every line that references them.

### Training activity (`data/<lang>/training-activities.json` → `activities[]`, collection)
`slug`, `title`, `tableId` (original TablePress id), `details[]` = rows `{label, values[]}`
(several values = several table rows, as "Duración" or "Procedimiento de control"). Tabs are
numbered automatically in array order.

### System texts (`data/<lang>/system.json`, single object)
`notFound` {title, heading, text}, `searchForm` {label, placeholder, button, buttonLabel},
`searchResults` {title with `{query}`, heading, readMore, noResults}.

### Redirect (`data/redirects.json` → `redirects[]`)
`from`, `to`, `status`, `note`.

### Documents
Documents are files, not JSON records: `public/wp-content/uploads/sites/8/<year>/<month>/<file>`,
linked from rich-text fields with their original URL. `npm run docs:documents` lists them with the
pages that use them ([documents-inventory.md](documents-inventory.md)); the validator fails if a
linked document is missing.
