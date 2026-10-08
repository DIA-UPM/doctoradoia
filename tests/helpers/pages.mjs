// Page inventory and screenshot helpers shared by the baseline capture and the
// visual regression / functional tests. The page list mirrors the URL inventory
// discovered by the crawler (docs/url-migration.md).
export const LIVE_ORIGIN = 'https://doctoradoia.dia.fi.upm.es';

export const PAGES = [
  { key: 'home', type: 'home', es: '/', en: '/language/en/overview/' },
  { key: 'objetivos', type: 'info', es: '/objetivos_competencias/', en: '/language/en/aims-competences-abilities-and-skills/' },
  { key: 'acceso', type: 'info-tabs', es: '/acceso_y_admision/', en: '/language/en/entry-requirements/' },
  { key: 'apoyo', type: 'info', es: '/apoyo_y_orientacion/', en: '/language/en/student-support-and-guidance-systems/' },
  { key: 'investigacion', type: 'research-lines', es: '/investigacion/', en: '/language/en/groups-and-lines-of-research/' },
  { key: 'formacion', type: 'info-tabs', es: '/actividades_formativas/', en: '/language/en/training_activities/' },
  { key: 'tesis', type: 'info-tabs', es: '/tesis_doctoral/', en: '/language/en/phd_thesis/' },
  { key: 'comisiones', type: 'info', es: '/comision_academica/', en: '/language/en/academic-commission/' },
  { key: 'informacion', type: 'info-tabs', es: '/informacion/', en: '/language/en/information/' },
  { key: 'contacto', type: 'contact', es: '/contacto/', en: '/language/en/contact/' },
];

export const ALL_URLS = PAGES.flatMap((p) => [
  { ...p, lang: 'es', path: p.es },
  { ...p, lang: 'en', path: p.en },
]);

// WordPress system pages (not in the sitemap): 404 and search results
export const SYSTEM_URLS = [
  { key: '404', type: '404', lang: 'es', path: '/pagina-inexistente-static-migration/' },
  { key: '404', type: '404', lang: 'en', path: '/language/en/page-that-does-not-exist-static-migration/' },
  { key: 'search', type: 'search', lang: 'es', path: '/?s=tesis' },
  { key: 'search', type: 'search', lang: 'en', path: '/language/en/?s=thesis' },
  { key: 'search-empty', type: 'search', lang: 'es', path: '/?s=zqxwvut' },
];

export const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
];

export const shotName = (page, lang, vp, state = 'full') => `${page}-${lang}-${vp}-${state}.png`;

/**
 * Brings a page (live or local) into a deterministic state before a screenshot:
 * - scrolls through it so lazy images load and scroll animations fire,
 * - forces every entrance animation into its final state,
 * - pauses the background video on its first frame,
 * - waits for fonts and images, scrolls back to the top.
 */
export async function stabilize(page) {
  await page.evaluate(async () => {
    const h = () => document.documentElement.scrollHeight;
    for (let y = 0; y < h(); y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}' });
  await page.evaluate(async () => {
    // entrance animations: final state (eb___animated -> eb__animated)
    document.querySelectorAll('[class*="eb___"]').forEach((el) => {
      [...el.classList].filter((c) => c.startsWith('eb___')).forEach((c) => { el.classList.remove(c); el.classList.add(c.replace('eb___', 'eb__')); });
    });
    document.querySelectorAll('video').forEach((v) => { try { v.pause(); v.currentTime = 0; } catch {} });
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 8000); }))));
    // large images can be loaded but not yet decoded when the screenshot is taken
    await Promise.all([...document.images].map((img) => (img.decode ? img.decode().catch(() => {}) : null)));
    // video background: wait until the first frame is decoded, then show exactly frame 0
    await Promise.all([...document.querySelectorAll('video')].map((v) => (v.readyState >= 2 ? null : new Promise((r) => { v.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 8000); }))));
    await Promise.all([...document.querySelectorAll('video')].map((v) => new Promise((r) => {
      v.pause();
      if (v.currentTime === 0 && !v.seeking) return r();
      v.addEventListener('seeked', r, { once: true }); setTimeout(r, 5000);
      v.currentTime = 0;
    })));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
}

/** every (page, viewport) pair of the visual baseline: all pages at all viewports, system pages at 1440 and 390 */
export const VISUAL_TARGETS = () => [
  ...ALL_URLS.flatMap((e) => VIEWPORTS.map((vp) => ({ entry: e, vp }))),
  ...SYSTEM_URLS.flatMap((e) => VIEWPORTS.filter((v) => ['1440', '390'].includes(v.name)).map((vp) => ({ entry: e, vp }))),
];
