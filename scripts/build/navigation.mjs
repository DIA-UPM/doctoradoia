/**
 * Turns data/navigation.json into the menu model used by the templates, reproducing
 * the CSS classes WordPress generated for menu items (current page, parent of the
 * current page, home item, language switcher), which the theme CSS relies on.
 */
export function buildMenu({ navigation, site, langs }, lang, currentKey) {
  const nav = navigation[lang];
  const pages = langs[lang].pages;
  const urlOf = (key, l = lang) => langs[l].pages[key]?.path;

  const leaf = (item) => {
    const page = pages[item.page];
    const current = item.page === currentKey;
    const classes = ['menu-item', 'menu-item-type-post_type', 'menu-item-object-page'];
    if (page?.isHome) classes.push('menu-item-home');
    if (current) classes.push('current-menu-item', 'page_item', `page-item-${page.wordpressId}`, 'current_page_item');
    classes.push(`menu-item-${item.id}`);
    return { ...item, href: item.url || urlOf(item.page), current, classes: classes.join(' ') };
  };

  const items = nav.items.map((item) => {
    if (!item.children) return leaf(item);
    const children = item.children.map(leaf);
    const isParent = children.some((c) => c.current);
    const classes = ['menu-item', 'menu-item-type-custom', 'menu-item-object-custom'];
    if (isParent) classes.push('current-menu-ancestor', 'current-menu-parent');
    classes.push('menu-item-has-children', `menu-item-${item.id}`);
    return { ...item, href: item.url || '#', children, classes: classes.join(' ') };
  });

  const sw = nav.languageSwitcher;
  const target = site.languages.find((l) => l.code === sw.language);
  const switcher = {
    id: sw.id,
    name: target.name,
    flag: target.flag,
    htmlLang: target.htmlLang,
    // link to the translation of the current page (falls back to the home page)
    href: urlOf(currentKey, sw.language) || urlOf('home', sw.language),
    // Polylang adds no-translation when the current page has no translation (e.g. 404)
    classes: `lang-item lang-item-${sw.termId} lang-item-${sw.language}${urlOf(currentKey, sw.language) ? '' : ' no-translation'} lang-item-first menu-item menu-item-type-custom menu-item-object-custom menu-item-${sw.id}`,
  };
  return { ...nav, items, switcher };
}
