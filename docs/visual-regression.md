# Visual regression — result and classification

`npm run test:visual` renders the local build in the same states as the live-site baseline
([visual-baseline.md](visual-baseline.md)) and compares every screenshot with pixelmatch
(tolerance 0.15 per pixel; a screenshot passes with ≤ 3 % differing pixels and ≤ 1 % height
difference; the Google Maps iframe is masked on both sides).
The per-screenshot table is regenerated in `tests/visual/output/report.md`.

## Result (final run, 2026-10-07)

| | |
|---|---|
| Screenshots compared | **309** (20 pages × 5 viewports × states, + 404/search at 1440/390) |
| Above threshold | **0** |
| Expected differences | 6 (search results, class A) |
| Average differing pixels (excluding expected) | 0.10 % |
| Largest remaining difference | 2.5 % — `formacion-*` full pages |

## Remaining differences and classification

| Screenshot(s) | Diff | Class | Explanation |
|---|---|---|---|
| `search-*`, `search-empty-*` (6) | 9–17 % | A — expected | The WordPress search template printed an author line ("Por jcano") under each result, linking to author archives that expose editor user names. Intentionally not reproduced, so results are ~36 px shorter each. Listed in `tests/visual/expected-differences.json`. |
| `formacion-*` (all viewports) | 1.4–2.5 %, 2 px shorter | E — spacing (minor) | Schedule table header: on the live site DataTables (jQuery) copies the header into a separate table and sets column widths in JavaScript; the static version is a single table inside the same scroll wrapper, so column borders sit a few pixels apart. Content and behaviour (horizontal scroll on small screens) are the same. |
| everything else | < 0.7 % | A — harmless | Font anti-aliasing and the background-video frame. |

## Problems found and corrected during the comparison

| Problem | Class | Fix |
|---|---|---|
| English pages broken (columns, video) | B | Essential Blocks ids of EN pages differ and some EN pages use older block markup → separate templates where the markup differs; CSS ids remapped |
| Hero 60 px shorter on contact pages | H | WordPress page title (`entryTitle`) was missing |
| Body text in a fallback font on some pages | D | `@font-face` of Noto Sans Hanunoo had been pruned (font used from another file) |
| Apoyo (ES) hero layout, investigación/acceso regressions | B | Live CSS comes from stale cache bundles: bundles are now the source of truth, reproducing which escaped rules browsers drop |
| Link colours (`wp-elements-*`) missing | B | PurgeCSS removed `:where(:not(…))` selectors; protected before pruning |
| Schedule table overflowing at 390 px | F | DataTables scroll wrapper reproduced statically |
| 404 header too tall, heading weight | B / D | No logo on opaque-header templates; Syne 400/500 drawn with the 600 face as on the original |
| Footer campus logo, contact backgrounds missing in the reference | C (baseline) | Hot-linked images failed on the live site during capture; baseline recaptured with completeness checks |
| Non-deterministic video frame / undecoded images | — (test) | Stabilisation seeks the video to frame 0 and awaits image decoding |
