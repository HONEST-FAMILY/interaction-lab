(function () {
  var hint = document.querySelector('.lab-hint');
  var dismissed = false;

  function dismissHint() {
    if (dismissed) return;
    dismissed = true;
    if (hint) hint.classList.add('is-gone');
  }

  window.addEventListener('pointerdown', dismissHint, { passive: true });
  window.addEventListener('keydown', dismissHint);

  function fitCanvas(canvas, maxDpr) {
    var dpr = Math.min(window.devicePixelRatio || 1, maxDpr || 2);
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.Lab = {
    dismissHint: dismissHint,
    fitCanvas: fitCanvas,
    reducedMotion: reducedMotion,
    isTouch: matchMedia('(pointer: coarse)').matches
  };
})();
