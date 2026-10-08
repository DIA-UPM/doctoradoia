/**
 * Header behaviour (replaces the Astra theme + Astra Pro scripts and jQuery):
 *  - switches the body between "ast-desktop" and "ast-header-break-point" at 921px
 *  - off-canvas mobile menu (open/close, overlay, Escape, submenu toggles)
 *  - keyboard access to the desktop dropdown (focus class)
 *  - sticky "slide" header on desktop after scrolling
 *  - scroll-to-top button
 * The markup and CSS classes are the ones the original theme used, so the original
 * (migrated) CSS keeps working unchanged.
 */
(function () {
  'use strict';
  var BREAKPOINT = 921;          // astra.break_point
  var html = document.documentElement;
  var body = document.body;
  var popup = document.getElementById('ast-mobile-popup');
  var closeBtn = document.getElementById('menu-toggle-close');
  var fixedHeader = document.getElementById('ast-fixed-header');
  var masthead = document.getElementById('masthead');
  var scrollTopBtn = document.getElementById('ast-scroll-top');
  var lastToggle = null;

  function isDesktop() { return window.innerWidth > BREAKPOINT; }

  /* ---------- responsive body class ---------- */
  function updateBreakpoint() {
    if (isDesktop()) { body.classList.remove('ast-header-break-point'); body.classList.add('ast-desktop'); if (popup && popup.classList.contains('active')) closePopup(); }
    else { body.classList.add('ast-header-break-point'); body.classList.remove('ast-desktop'); }
  }

  /* ---------- off-canvas menu ---------- */
  function toggles() { return document.querySelectorAll('.menu-toggle'); }
  function openPopup(trigger) {
    if (!popup) return;
    lastToggle = trigger || null;
    body.classList.add('ast-popup-nav-open');
    html.classList.add('ast-off-canvas-active');
    popup.classList.add('active', 'show');
    var mobileContent = popup.querySelector('.ast-mobile-popup-content');
    var desktopContent = popup.querySelector('.ast-desktop-popup-content');
    if (mobileContent) mobileContent.style.display = 'block';
    if (desktopContent) desktopContent.style.display = 'none';
    toggles().forEach(function (t) { t.style.display = 'none'; t.setAttribute('aria-expanded', 'true'); });
    if (closeBtn) closeBtn.focus();
  }
  function closePopup() {
    if (!popup) return;
    body.classList.remove('ast-main-header-nav-open', 'ast-popup-nav-open');
    html.classList.remove('ast-off-canvas-active');
    popup.classList.remove('active', 'show');
    toggles().forEach(function (t) { t.classList.remove('toggled'); t.style.display = 'flex'; t.setAttribute('aria-expanded', 'false'); });
    popup.querySelectorAll('.ast-submenu-expanded').forEach(function (li) { setSubmenu(li, false); });
    if (lastToggle && typeof lastToggle.focus === 'function') lastToggle.focus();
  }
  function setSubmenu(li, open) {
    var sub = li.querySelector(':scope > .sub-menu');
    var btn = li.querySelector(':scope > .ast-menu-toggle');
    li.classList.toggle('ast-submenu-expanded', open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (sub) sub.style.display = open ? 'block' : 'none';
  }

  document.querySelectorAll('#ast-mobile-header .menu-toggle').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.preventDefault(); openPopup(btn); });
  });
  if (closeBtn) closeBtn.addEventListener('click', function (e) { e.preventDefault(); closePopup(); });
  if (popup) {
    var overlay = popup.querySelector('.ast-mobile-popup-overlay');
    if (overlay) overlay.addEventListener('click', closePopup);
    popup.querySelectorAll('.ast-menu-toggle').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var li = btn.parentElement;
        setSubmenu(li, !li.classList.contains('ast-submenu-expanded'));
      });
    });
    // following a link inside the drawer closes it (Astra does the same for in-page links)
    popup.querySelectorAll('a[href]').forEach(function (a) {
      if (a.getAttribute('href') === '#') a.addEventListener('click', function (e) { e.preventDefault(); var li = a.parentElement; if (li.classList.contains('menu-item-has-children')) setSubmenu(li, !li.classList.contains('ast-submenu-expanded')); });
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && popup && popup.classList.contains('active')) closePopup();
  });

  /* ---------- desktop dropdown: keyboard support ---------- */
  document.querySelectorAll('#ast-desktop-header .menu-item-has-children, #ast-fixed-header .menu-item-has-children').forEach(function (li) {
    li.addEventListener('focusin', function () { li.classList.add('focus'); });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) li.classList.remove('focus'); });
    var link = li.querySelector(':scope > a');
    if (link && link.getAttribute('href') === '#') link.addEventListener('click', function (e) { e.preventDefault(); });
  });

  /* ---------- sticky header (Astra Pro "slide" style, desktop only) ---------- */
  var stuck = false;
  function stickThreshold() { return masthead ? masthead.offsetTop + masthead.offsetHeight : 0; }
  function updateSticky() {
    if (!fixedHeader) return;
    var shouldStick = isDesktop() && window.pageYOffset > stickThreshold();
    if (shouldStick === stuck) return;
    stuck = shouldStick;
    if (stuck) {
      fixedHeader.style.top = '0px';
      fixedHeader.classList.add('ast-header-slide', 'ast-sticky-active', 'ast-header-sticked');
      fixedHeader.style.visibility = 'visible';
      fixedHeader.style.transform = 'translateY(0px)';
      html.classList.add('ast-header-stick-slide-active');
    } else {
      fixedHeader.classList.remove('ast-sticky-active', 'ast-header-sticked');
      fixedHeader.style.transform = 'translateY(-100%)';
      fixedHeader.style.visibility = 'hidden';
      fixedHeader.style.top = '';
      html.classList.remove('ast-header-stick-slide-active');
    }
  }
  if (fixedHeader) {
    fixedHeader.classList.add('ast-sticky-shrunk');
    fixedHeader.style.transform = 'translateY(-100%)';
  }

  /* ---------- scroll to top ---------- */
  function updateScrollTop() {
    if (!scrollTopBtn) return;
    var header = document.querySelector('#page header');
    var limit = header ? header.offsetHeight + 100 : 300;
    scrollTopBtn.style.display = window.pageYOffset > limit ? 'block' : 'none';
  }
  if (scrollTopBtn) {
    var toTop = function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    scrollTopBtn.addEventListener('click', toTop);
    scrollTopBtn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') toTop(e); });
  }

  function onScroll() { updateSticky(); updateScrollTop(); }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { updateBreakpoint(); onScroll(); });
  updateBreakpoint();
  onScroll();
})();
