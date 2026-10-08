# Visual baseline

Screenshots of the **live site** taken with Playwright/Chromium by `npm run baseline` (tests/visual/capture-baseline.mjs) and stored in `tests/reference/`. Viewports: 1920×1080, 1440×900, 1024×768, 768×1024, 390×844 (system pages: 1440 and 390).

Before every screenshot the page is scrolled to the bottom (lazy images, scroll animations), entrance animations are forced to their final state, CSS transitions are disabled, the hero video is paused on its first frame and fonts/images are awaited. A capture is accepted only when every image, font, stylesheet and script loaded (up to 4 attempts); pages captured with missing resources are flagged below.

States: `full` = full page (entrance animations in final state, video paused on first frame); `top` = first screen; `dropdown` = "Aspirantes" dropdown open (hover); `sticky` = sticky header after scrolling 900 px; `menu-open` = mobile off-canvas menu open; `tab2` = second tab selected.

| Page | Page type | Original URL | Screenshots | Interactive states | Missing resources at capture |
|---|---|---|---|---|---|
| objetivos (es) | info | https://doctoradoia.dia.fi.upm.es/objetivos_competencias/ | 14 (`objetivos-es-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| objetivos (en) | info | https://doctoradoia.dia.fi.upm.es/language/en/aims-competences-abilities-and-skills/ | 14 (`objetivos-en-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| acceso (es) | info-tabs | https://doctoradoia.dia.fi.upm.es/acceso_y_admision/ | 14 (`acceso-es-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| acceso (en) | info-tabs | https://doctoradoia.dia.fi.upm.es/language/en/entry-requirements/ | 14 (`acceso-en-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| apoyo (es) | info | https://doctoradoia.dia.fi.upm.es/apoyo_y_orientacion/ | 14 (`apoyo-es-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| apoyo (en) | info | https://doctoradoia.dia.fi.upm.es/language/en/student-support-and-guidance-systems/ | 14 (`apoyo-en-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | www.fi.upm.es/web/futuroalumno/wp-content/uploads/sites/15/2015/11/logo_i2tech.png |
| investigacion (es) | research-lines | https://doctoradoia.dia.fi.upm.es/investigacion/ | 14 (`investigacion-es-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| investigacion (en) | research-lines | https://doctoradoia.dia.fi.upm.es/language/en/groups-and-lines-of-research/ | 14 (`investigacion-en-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| formacion (es) | info-tabs | https://doctoradoia.dia.fi.upm.es/actividades_formativas/ | 14 (`formacion-es-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| formacion (en) | info-tabs | https://doctoradoia.dia.fi.upm.es/language/en/training_activities/ | 14 (`formacion-en-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| tesis (es) | info-tabs | https://doctoradoia.dia.fi.upm.es/tesis_doctoral/ | 14 (`tesis-es-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| tesis (en) | info-tabs | https://doctoradoia.dia.fi.upm.es/language/en/phd_thesis/ | 14 (`tesis-en-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| comisiones (es) | info | https://doctoradoia.dia.fi.upm.es/comision_academica/ | 13 (`comisiones-es-<viewport>-<state>.png`) | dropdown, sticky, open | none |
| comisiones (en) | info | https://doctoradoia.dia.fi.upm.es/language/en/academic-commission/ | 13 (`comisiones-en-<viewport>-<state>.png`) | dropdown, sticky, open | none |
| informacion (es) | info-tabs | https://doctoradoia.dia.fi.upm.es/informacion/ | 14 (`informacion-es-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| informacion (en) | info-tabs | https://doctoradoia.dia.fi.upm.es/language/en/information/ | 14 (`informacion-en-<viewport>-<state>.png`) | dropdown, sticky, tab2, open | none |
| contacto (es) | contact | https://doctoradoia.dia.fi.upm.es/contacto/ | 13 (`contacto-es-<viewport>-<state>.png`) | dropdown, sticky, open | none |
| contacto (en) | contact | https://doctoradoia.dia.fi.upm.es/language/en/contact/ | 13 (`contacto-en-<viewport>-<state>.png`) | dropdown, sticky, open | none |
| 404 (es) | 404 | https://doctoradoia.dia.fi.upm.es/pagina-inexistente-static-migration/ | 7 (`404-es-<viewport>-<state>.png`) | dropdown, sticky, open | none |
| 404 (en) | 404 | https://doctoradoia.dia.fi.upm.es/language/en/page-that-does-not-exist-static-migration/ | 7 (`404-en-<viewport>-<state>.png`) | dropdown, sticky, open | none |
| search (es) | search | https://doctoradoia.dia.fi.upm.es/?s=tesis | 7 (`search-es-<viewport>-<state>.png`) | dropdown, sticky, open | none |
| search (en) | search | https://doctoradoia.dia.fi.upm.es/language/en/?s=thesis | 7 (`search-en-<viewport>-<state>.png`) | dropdown, sticky, open | none |
| search-empty (es) | search | https://doctoradoia.dia.fi.upm.es/?s=zqxwvut | 7 (`search-empty-es-<viewport>-<state>.png`) | dropdown, sticky, open | none |
| home (es) | home | https://doctoradoia.dia.fi.upm.es/ | 13 (`home-es-<viewport>-<state>.png`) | dropdown, sticky, open | none |
| home (en) | home | https://doctoradoia.dia.fi.upm.es/language/en/overview/ | 13 (`home-en-<viewport>-<state>.png`) | dropdown, sticky, open | none |

Total: 309 screenshots.
