// Readable JSON field names for the homepage blocks (Essential Blocks id -> content path).
export default {
  // background video of the hero (was configured in the Video Background plugin)
  attrs: { '#portada-doctorado, #phd-overview': { 'data-vidbg-mp4': 'hero.video', 'data-vidbg-poster': 'hero.videoPoster' } },
  extra: {
    es: { 'hero.video': '/assets/video/Video-portada-Doctorado-bola-4.mp4', 'hero.videoPoster': '/assets/images/portada-doctorado-movil-scaled.jpg' },
    en: { 'hero.video': '/assets/video/Video-portada-Doctorado-bola-4.mp4', 'hero.videoPoster': '' },
  },
  names: {
    // video hero (desktop): programme title, intro, places, and the five research lines around the sphere
    o8eencw: 'hero.programme',
    tgjti8g: 'hero.intro',
    '51e9ksh': 'hero.places',
    '39ppnq4': 'hero.researchLines.0',
    '9x2y64c': 'hero.researchLines.1',
    awxgtbf: 'hero.researchLines.2',
    '0g7se0p': 'hero.researchLines.3',
    '5gko5fy': 'hero.researchLines.4',
    // hero shown on mobile instead of the desktop one
    dy195hd: 'heroMobile.programme',
    x1brcfd: 'heroMobile.places',
    tx6jrvn: 'heroMobile.intro',
    // "5 líneas de investigación" tabs (mobile)
    sjw7mzu: 'researchTabs.heading',
    zl6mp0a: 'researchTabs',
    '1muqujj': 'researchTabs.lines.0',
    mecwxcl: 'researchTabs.lines.1',
    '8twlfdk': 'researchTabs.lines.2',
    sw7um9a: 'researchTabs.lines.3',
    qfiplfs: 'researchTabs.lines.4',
    // "Cinco líneas de investigación" section
    c2fb54p: 'researchIntro.heading',
    u1yftbf: 'researchIntro',
    hr0gey1: 'researchIntro.text',
    // programme purpose
    '3u8abc7': 'purpose.heading',
    l1a99uy: 'purpose',
    // programme strengths (info boxes)
    '4dz10kt': 'strengths.heading',
    '49vro33': 'strengths.items.0',
    et9wvpe: 'strengths.items.1',
    peo0znf: 'strengths.items.2',
    bt0nsr6: 'strengths.items.3',
    w71osum: 'strengths.items.4',
    '4k1irvu': 'strengths.items.5',
    '83s68gd': 'strengths.items.6',
    // programme history
    i3qz6fs: 'history.heading',
    '439gs8f': 'history',
  },
};
