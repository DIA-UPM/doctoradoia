/**
 * Tabs (replaces Essential Blocks' advanced-tabs frontend.js).
 * Markup: .eb-advanced-tabs-wrapper > .eb-tabs-nav > ul.tabTitles > li[data-title-tab-id]
 *         .eb-advanced-tabs-wrapper > .eb-tabs-contents > .eb-tab-wrapper[data-tab-id]
 * Adds keyboard support and ARIA roles that the original lacked (tab titles were
 * mouse-only <li> elements); visual behaviour is unchanged.
 * Without JavaScript all panels stay visible (the "inactive" class is only set here).
 */
(function () {
  'use strict';
  var hash = window.location.hash.substring(1);

  function init(ul) {
    var wrapper = ul.closest('.eb-advanced-tabs-wrapper');
    var titles = Array.prototype.slice.call(ul.children);
    var panels = Array.prototype.slice.call(wrapper.children[1].children);
    var vertical = wrapper.classList.contains('vertical') && wrapper.getAttribute('data-min-height') === 'true';
    var closeAll = wrapper.getAttribute('data-close-all-tabs') === 'true';
    var uid = ul.getAttribute('data-tabs-ul-id') || 'tabs';

    // groups whose titles contain links (e.g. '+ Info') keep plain list semantics: a link
    // inside role=tab would be a nested interactive control
    var aria = !titles.some(function (li) { return li.querySelector('a'); });
    if (aria) ul.setAttribute('role', 'tablist');
    if (aria && vertical) ul.setAttribute('aria-orientation', 'vertical');
    if (aria) titles.forEach(function (li) {
      var id = li.getAttribute('data-title-tab-id');
      li.setAttribute('role', 'tab');
      li.id = li.id || uid + '-tab-' + id;
      li.setAttribute('aria-controls', uid + '-panel-' + id);
    });
    if (aria) panels.forEach(function (p) {
      p.setAttribute('role', 'tabpanel');
      p.id = p.id || uid + '-panel-' + p.getAttribute('data-tab-id');
      p.setAttribute('aria-labelledby', uid + '-tab-' + p.getAttribute('data-tab-id'));
    });

    function activate(li, focus) {
      titles.forEach(function (t) {
        var on = t === li;
        t.classList.toggle('active', on); t.classList.toggle('inactive', !on);
        if (!aria) return;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
      });
      panels.forEach(function (p) {
        var on = li && p.getAttribute('data-tab-id') === li.getAttribute('data-title-tab-id');
        p.classList.toggle('active', on); p.classList.toggle('inactive', !on);
        if (!on) p.style.minHeight = '';
      });
      if (vertical && li) {
        var active = wrapper.querySelector('.eb-tabs-contents .eb-tab-wrapper.active');
        if (active) active.style.minHeight = ul.offsetHeight + 'px';
      }
      if (focus && li) li.focus();
    }

    var initial = titles.filter(function (t) { return hash && t.getAttribute('data-title-custom-id') === hash; })[0]
      || titles.filter(function (t) { return t.classList.contains('active'); })[0]
      || (closeAll ? null : titles[0]);
    activate(initial, false);

    titles.forEach(function (li, i) {
      li.addEventListener('click', function () { activate(li, false); });
      li.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = titles[(i + 1) % titles.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = titles[(i - 1 + titles.length) % titles.length];
        else if (e.key === 'Home') next = titles[0];
        else if (e.key === 'End') next = titles[titles.length - 1];
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(li, false); return; }
        if (next) { e.preventDefault(); activate(next, true); }
      });
    });
  }

  function start() { document.querySelectorAll('.eb-advanced-tabs-wrapper > .eb-tabs-nav > ul.tabTitles').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
