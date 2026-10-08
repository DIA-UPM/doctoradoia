/**
 * Background video (replaces the jQuery "Video Background" plugin, vidbg.js 2.7.7).
 * Any element with data-vidbg-mp4 gets a muted, looping, auto-playing video behind its
 * content, sized to cover the element. Mobile devices get the poster image instead,
 * exactly like the original plugin.
 *   <div data-vidbg-mp4="/assets/video/x.mp4" data-vidbg-poster="/assets/images/x.jpg">
 */
(function () {
  'use strict';
  var isMobile = /(Android|iPod|iPhone|iPad|BlackBerry|IEMobile|Opera Mini)/.test(navigator.userAgent);

  function init(el) {
    var mp4 = el.getAttribute('data-vidbg-mp4');
    var poster = el.getAttribute('data-vidbg-poster');
    var container = document.createElement('div');
    container.className = 'vidbg-container';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.zIndex = '1';
    el.insertBefore(container, el.firstChild);
    var showPoster = function () { if (poster) container.style.backgroundImage = 'url(' + poster + ')'; };
    if (isMobile || !mp4) { showPoster(); }
    else {
      var video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.muted = true; video.defaultMuted = true; video.loop = true; video.autoplay = true;
      video.setAttribute('muted', ''); video.setAttribute('loop', ''); video.setAttribute('autoplay', '');
      video.setAttribute('aria-hidden', 'true');
      var source = document.createElement('source');
      source.src = mp4; source.type = 'video/mp4';
      video.appendChild(source);
      container.appendChild(video);
      var resize = function () {
        var h = container.offsetHeight, w = container.offsetWidth;
        if (!video.videoWidth) return;
        if (w / video.videoWidth > h / video.videoHeight) { video.style.width = (w + 2) + 'px'; video.style.height = 'auto'; }
        else { video.style.width = 'auto'; video.style.height = (h + 2) + 'px'; }
      };
      video.addEventListener('canplaythrough', resize, { once: true });
      video.addEventListener('loadedmetadata', resize, { once: true });
      video.addEventListener('playing', function () { video.style.opacity = '1'; }, { once: true });
      window.addEventListener('resize', resize);
      var p = video.play();
      if (p && p.catch) p.catch(showPoster);
      // reduced motion: keep the first frame, do not loop the animation
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { video.addEventListener('playing', function () { video.pause(); }, { once: true }); }
    }
    var overlay = document.createElement('div');
    overlay.className = 'vidbg-overlay';
    container.appendChild(overlay);
  }

  function start() { document.querySelectorAll('[data-vidbg-mp4]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
