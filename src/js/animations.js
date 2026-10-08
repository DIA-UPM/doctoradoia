/**
 * Entrance animations (replaces Essential Blocks' eb-animation-load.js).
 * Elements marked with "eb___animated eb___<effect>" start their animate.css effect
 * ("eb__animated eb__<effect>") the first time they are inside the viewport.
 * Content is visible without JavaScript: the classes only add the animation.
 */
(function () {
  'use strict';
  var SELECTOR = '.eb___animated';
  function inViewport(el) {
    var r = el.getBoundingClientRect();
    var h = window.innerHeight || document.documentElement.clientHeight;
    var w = window.innerWidth || document.documentElement.clientWidth;
    return r.top >= 0 && r.top <= h && r.left >= 0 && r.right <= w;
  }
  function check() {
    document.querySelectorAll(SELECTOR).forEach(function (el) {
      if (!inViewport(el)) return;
      var add = [], remove = [];
      el.classList.forEach(function (c) { if (c.indexOf('eb___') === 0) { remove.push(c); add.push(c.replace('eb___', 'eb__')); } });
      el.classList.remove.apply(el.classList, remove);
      el.classList.add.apply(el.classList, add);
    });
  }
  function start() {
    // same 500 ms delay as the original script
    setTimeout(function () { check(); window.addEventListener('scroll', check, true); }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
