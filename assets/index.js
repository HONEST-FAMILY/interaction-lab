(function () {
  var hero = document.querySelector('.ix-hero');
  var canvas = document.getElementById('hero');
  var header = document.querySelector('.ix-header');
  var rows = document.querySelectorAll('.ix-row');

  var engine = ParticleText(canvas, {
    words: ['와우', '손맛', '디테일'],
    accent: '#e5482d',
    autoAdvance: 5200,
    centerY: 0.4,
    boxW: 0.72,
    boxH: 0.42,
    density: 220,
    maxCount: 6400
  });
  engine.on('tap', function () { engine.next(); });

  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 900); })]).then(function () {
    requestAnimationFrame(function () { hero.classList.add('is-in'); });
  });

  new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) engine.resume(); else engine.pause(); });
  }).observe(hero);

  function onScroll() {
    header.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.82);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
  rows.forEach(function (r) { revealIO.observe(r); });

  var videoIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else v.pause();
    });
  }, { threshold: 0.35 });

  var narrow = window.matchMedia('(max-width: 760px)');
  function setupInline() {
    rows.forEach(function (row) {
      var box = row.querySelector('.ix-media');
      var existing = box.querySelector('video');
      if (!narrow.matches) {
        if (existing) { videoIO.unobserve(existing); box.removeChild(existing); }
        return;
      }
      if (existing) return;
      var v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.preload = 'none';
      v.poster = row.dataset.poster;
      v.src = row.dataset.video;
      box.appendChild(v);
      videoIO.observe(v);
    });
  }
  setupInline();
  if (narrow.addEventListener) narrow.addEventListener('change', setupInline);

  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var preview = document.querySelector('.ix-preview');
  var pv = preview.querySelector('video');
  var mx = 0, my = 0, x = 0, y = 0, rot = 0, active = null, raf = 0;

  function follow() {
    var nx = x + (mx - x) * 0.14;
    var ny = y + (my - y) * 0.14;
    var vx = nx - x;
    x = nx;
    y = ny;
    rot += (Math.max(-7, Math.min(7, vx * 0.3)) - rot) * 0.12;
    var w = preview.offsetWidth, h = preview.offsetHeight;
    preview.style.transform = 'translate3d(' + (x - w / 2).toFixed(1) + 'px,' + (y - h / 2).toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg)';
    if (active || Math.abs(mx - x) + Math.abs(my - y) > 0.5 || Math.abs(rot) > 0.05) raf = requestAnimationFrame(follow);
    else raf = 0;
  }

  rows.forEach(function (row) {
    row.addEventListener('pointerenter', function (e) {
      if (!fine.matches || e.pointerType !== 'mouse') return;
      if (!active && !preview.classList.contains('is-on')) { x = mx = e.clientX; y = my = e.clientY; }
      active = row;
      if (pv.getAttribute('src') !== row.dataset.video) {
        pv.poster = row.dataset.poster;
        pv.setAttribute('src', row.dataset.video);
      }
      var p = pv.play();
      if (p && p.catch) p.catch(function () {});
      preview.classList.add('is-on');
      if (!raf) raf = requestAnimationFrame(follow);
    });
    row.addEventListener('pointerleave', function () {
      if (active !== row) return;
      active = null;
      preview.classList.remove('is-on');
      if (!raf) raf = requestAnimationFrame(follow);
    });
  });

  window.addEventListener('pointermove', function (e) {
    mx = e.clientX;
    my = e.clientY;
  }, { passive: true });
})();
