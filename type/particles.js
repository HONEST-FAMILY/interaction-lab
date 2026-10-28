(function () {
  function hexToRgb(hex) {
    var v = parseInt(hex.replace('#', ''), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function mixRgb(a, b, t) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  function splitLines(text, portrait) {
    var parts = text.split(/\n/);
    if (parts.length > 1) return parts;
    var chars = Array.from(text);
    if (portrait && chars.length > 4) {
      var space = text.indexOf(' ');
      if (space > 0) return [text.slice(0, space), text.slice(space + 1)];
      var half = Math.ceil(chars.length / 2);
      return [chars.slice(0, half).join(''), chars.slice(half).join('')];
    }
    return [text];
  }

  function ParticleText(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var ink = hexToRgb(opts.ink || '#141414');
    var accent = hexToRgb(opts.accent || '#e5482d');
    var fontFamily = opts.fontFamily || '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    var weight = opts.weight || 800;
    var words = opts.words || ['와우'];
    var centerY = opts.centerY || 0.5;
    var boxW = opts.boxW || 0.84;
    var boxH = opts.boxH || 0.5;
    var density = opts.density || 190;
    var minCount = opts.minCount || 2600;
    var maxCount = opts.maxCount || 7200;
    var autoAdvance = opts.autoAdvance || 0;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var maxDpr = opts.maxDpr || 2;

    var BUCKETS = 6;
    var colors = [];
    for (var b = 0; b < BUCKETS; b++) colors.push(mixRgb(ink, accent, b / (BUCKETS - 1)));

    var W = 0, H = 0, dpr = 1, N = 0;
    var px, py, vx, vy, fx, fy, tx, ty, t0, bend, rad, seed, orbit;
    var wordIndex = 0;
    var text = words[0];
    var pointers = new Map();
    var running = true;
    var paused = false;
    var raf = 0;
    var lastFrame = 0;
    var acc = 0;
    var lastInput = performance.now();
    var ready = false;
    var morphDur = 1150;
    var introAt = 0;
    var baseR = 1;
    var touchScale = 1;
    var listeners = [];

    function allocate(n) {
      N = n;
      px = new Float32Array(n); py = new Float32Array(n);
      vx = new Float32Array(n); vy = new Float32Array(n);
      fx = new Float32Array(n); fy = new Float32Array(n);
      tx = new Float32Array(n); ty = new Float32Array(n);
      t0 = new Float32Array(n); bend = new Float32Array(n);
      rad = new Float32Array(n); seed = new Float32Array(n);
      orbit = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        seed[i] = Math.random();
        rad[i] = baseR * (0.86 + Math.random() * 0.3);
        orbit[i] = 14 + Math.pow(Math.random(), 0.7) * 120;
      }
    }

    function sample(str, count) {
      var portrait = W / H < 0.85;
      var lines = splitLines(str, portrait);
      var off = document.createElement('canvas');
      off.width = Math.max(1, Math.ceil(W));
      off.height = Math.max(1, Math.ceil(H));
      var c = off.getContext('2d', { willReadFrequently: true });
      c.fillStyle = '#000';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = weight + ' 100px ' + fontFamily;
      var widest = 1;
      for (var l = 0; l < lines.length; l++) widest = Math.max(widest, c.measureText(lines[l]).width);
      var lineH = 1.06;
      var fitW = portrait ? Math.min(0.92, boxW + 0.08) : boxW;
      var fitH = portrait ? Math.min(0.62, boxH + 0.1) : boxH;
      var fs = Math.min((W * fitW) / widest * 100, (H * fitH) / (lines.length * lineH));
      fs = Math.min(fs, opts.maxFont || 560);
      c.font = weight + ' ' + fs + 'px ' + fontFamily;
      var top = H * centerY - ((lines.length - 1) * fs * lineH) / 2;
      for (var k = 0; k < lines.length; k++) c.fillText(lines[k], W / 2, top + k * fs * lineH + fs * 0.04);
      var data = c.getImageData(0, 0, off.width, off.height).data;
      var ow = off.width, oh = off.height;
      var filled = 0;
      for (var y = 0; y < oh; y += 2) for (var x = 0; x < ow; x += 2) if (data[(y * ow + x) * 4 + 3] > 128) filled++;
      var area = filled * 4;
      var step = Math.max(1.2, Math.sqrt(area / (count * 1.08)));
      var pts = [];
      for (var gy = step * 0.5; gy < oh; gy += step) {
        for (var gx = step * 0.5; gx < ow; gx += step) {
          var sx = gx + (Math.random() - 0.5) * step * 0.36;
          var sy = gy + (Math.random() - 0.5) * step * 0.36;
          var ix = sx | 0, iy = sy | 0;
          if (ix < 0 || iy < 0 || ix >= ow || iy >= oh) continue;
          if (data[(iy * ow + ix) * 4 + 3] > 128) pts.push(sx, sy);
        }
      }
      var m = pts.length / 2;
      var order = new Uint32Array(m);
      for (var o = 0; o < m; o++) order[o] = o;
      for (var s = m - 1; s > 0; s--) { var r = (Math.random() * (s + 1)) | 0; var tmp = order[s]; order[s] = order[r]; order[r] = tmp; }
      var out = new Float32Array(count * 2);
      for (var q = 0; q < count; q++) {
        if (m === 0) { out[q * 2] = W / 2; out[q * 2 + 1] = H / 2; continue; }
        var idx = order[q % m];
        var dup = q >= m ? 1 : 0;
        out[q * 2] = pts[idx * 2] + (dup ? (Math.random() - 0.5) * step * 0.5 : 0);
        out[q * 2 + 1] = pts[idx * 2 + 1] + (dup ? (Math.random() - 0.5) * step * 0.5 : 0);
      }
      return out;
    }

    function assign(targets, now, intro) {
      var n = N;
      var keyT = new Float32Array(n), keyP = new Float32Array(n);
      var ti = new Uint32Array(n), pi = new Uint32Array(n);
      for (var i = 0; i < n; i++) {
        ti[i] = i; pi[i] = i;
        keyT[i] = targets[i * 2] + targets[i * 2 + 1] * 0.35;
        keyP[i] = px[i] + py[i] * 0.35;
      }
      var tArr = Array.prototype.slice.call(ti).sort(function (a, b) { return keyT[a] - keyT[b]; });
      var pArr = Array.prototype.slice.call(pi).sort(function (a, b) { return keyP[a] - keyP[b]; });
      var minX = Infinity, maxX = -Infinity;
      for (var j = 0; j < n; j++) { minX = Math.min(minX, targets[j * 2]); maxX = Math.max(maxX, targets[j * 2]); }
      var spanX = Math.max(1, maxX - minX);
      for (var k = 0; k < n; k++) {
        var p = pArr[k], t = tArr[k];
        fx[p] = px[p]; fy[p] = py[p];
        tx[p] = targets[t * 2]; ty[p] = targets[t * 2 + 1];
        var sweep = (tx[p] - minX) / spanX;
        t0[p] = now + (intro ? sweep * 420 + Math.random() * 160 : sweep * 380 + Math.random() * 90);
        bend[p] = (Math.random() - 0.5) * (intro ? 0.9 : 0.55);
      }
    }

    function scatterIntro() {
      for (var i = 0; i < N; i++) {
        px[i] = fx[i] = tx[i] = -W * 0.04 + Math.random() * W * 1.08;
        py[i] = fy[i] = ty[i] = -H * 0.04 + Math.random() * H * 1.08;
        vx[i] = 0; vy[i] = 0;
      }
      introAt = performance.now();
    }

    function loadFont(str) {
      if (!document.fonts || !document.fonts.load) return Promise.resolve();
      var p = document.fonts.load(weight + ' 100px "Pretendard Variable"', str);
      var timeout = new Promise(function (r) { setTimeout(r, 1800); });
      return Promise.race([p, timeout]).catch(function () {});
    }

    function setText(str, intro) {
      text = str;
      lastInput = performance.now();
      return loadFont(str).then(function () {
        var targets = sample(str, N);
        assign(targets, performance.now(), intro);
        ready = true;
        emit('change', str);
      });
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      var rect = canvas.getBoundingClientRect();
      var nw = Math.max(1, rect.width), nh = Math.max(1, rect.height);
      var changed = Math.abs(nw - W) > 1 || Math.abs(nh - H) > 1;
      W = nw; H = nh;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      touchScale = Math.min(W, H) < 700 ? 0.82 : 1;
      baseR = Math.min(W, H) < 700 ? 1.15 : 1.1;
      return changed;
    }

    function step(now) {
      var ps = [];
      pointers.forEach(function (p) { ps.push(p); });
      var breathe = reduced ? 0 : 0.55;
      var tA = now * 0.0011, tB = now * 0.0009;
      var R = 92 * touchScale;
      for (var i = 0; i < N; i++) {
        var pr = clamp01((now - t0[i]) / morphDur);
        var e = easeInOutCubic(pr);
        var dx = tx[i] - fx[i], dy = ty[i] - fy[i];
        var s = Math.sin(Math.PI * e) * bend[i];
        var bx = fx[i] + dx * e - dy * s + Math.sin(tA + seed[i] * 6.283) * breathe;
        var by = fy[i] + dy * e + dx * s + Math.cos(tB + seed[i] * 9.17) * breathe;
        var k = 0.1, axx = 0, ayy = 0;
        for (var j = 0; j < ps.length; j++) {
          var p = ps[j];
          var qx = px[i] - p.x, qy = py[i] - p.y;
          var d2 = qx * qx + qy * qy;
          if (p.gather > 0) {
            var GR = p.gatherR;
            if (d2 < GR * GR) {
              var d = Math.sqrt(d2) || 1;
              var c = smooth(1 - d / GR) * p.gather;
              var ux = qx / d, uy = qy / d;
              k *= 1 - 0.96 * c;
              var radial = (d - orbit[i] * p.gather) * 0.045 * c;
              axx += -ux * radial + -uy * 1.05 * c;
              ayy += -uy * radial + ux * 1.05 * c;
            }
          } else if (p.active && d2 < R * R) {
            var dd = Math.sqrt(d2) || 1;
            var f = 1 - dd / R;
            var strength = (1.6 + Math.min(p.speed, 46) * 0.13) * f * f;
            axx += (qx / dd) * strength;
            ayy += (qy / dd) * strength;
          }
        }
        vx[i] = vx[i] * 0.78 + (bx - px[i]) * k + axx;
        vy[i] = vy[i] * 0.78 + (by - py[i]) * k + ayy;
        px[i] += vx[i];
        py[i] += vy[i];
      }
      for (var z = 0; z < ps.length; z++) ps[z].speed *= 0.82;
    }

    function render() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!ready) return;
      var gain = introAt ? 0.3 + 0.7 * clamp01((performance.now() - introAt - 900) / 1400) : 1;
      var dots = [], streaks = [];
      for (var b = 0; b < BUCKETS; b++) { dots.push(new Path2D()); streaks.push(new Path2D()); }
      for (var i = 0; i < N; i++) {
        var x = px[i], y = py[i];
        if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
        var vxi = vx[i], vyi = vy[i];
        var sp = Math.sqrt(vxi * vxi + vyi * vyi);
        var bucket = (clamp01((sp - 0.9) / 7.5) * gain * (BUCKETS - 1) + 0.5) | 0;
        var r = rad[i];
        if (sp < 1.1) {
          dots[bucket].moveTo(x + r, y);
          dots[bucket].arc(x, y, r, 0, 6.2832);
        } else {
          var len = Math.min(2.2, 26 / sp);
          streaks[bucket].moveTo(x - vxi * len, y - vyi * len);
          streaks[bucket].lineTo(x, y);
        }
      }
      ctx.lineCap = 'round';
      ctx.lineWidth = baseR * 2;
      for (var k = 0; k < BUCKETS; k++) {
        ctx.fillStyle = colors[k];
        ctx.fill(dots[k]);
        ctx.strokeStyle = colors[k];
        ctx.stroke(streaks[k]);
      }
    }

    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (!lastFrame) lastFrame = now;
      var dt = Math.min(64, now - lastFrame);
      lastFrame = now;
      acc += dt;
      var steps = 0;
      while (acc >= 16.6667 && steps < 3) { updatePointers(now); step(now); acc -= 16.6667; steps++; }
      if (steps === 3) acc = 0;
      render();
      if (autoAdvance && ready && pointers.size === 0 && now - lastInput > autoAdvance) next();
    }

    function updatePointers(now) {
      pointers.forEach(function (p) {
        if (p.down && !p.gathering && now - p.downAt > 240 && p.travel < 26) p.gathering = true;
        if (p.gathering) {
          p.gather = Math.min(1, p.gather + 0.06);
          var held = Math.min(1, (now - p.downAt - 240) / 1600);
          p.gatherR = (150 + Math.max(W, H) * 0.42 * held) * touchScale + 40;
        }
      });
    }

    function local(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onDown(e) {
      lastInput = performance.now();
      var l = local(e);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      pointers.set(e.pointerId, { x: l.x, y: l.y, sx: l.x, sy: l.y, down: true, downAt: performance.now(), travel: 0, speed: 0, active: true, gather: 0, gatherR: 0, gathering: false, type: e.pointerType });
    }

    function onMove(e) {
      lastInput = performance.now();
      var l = local(e);
      var p = pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType !== 'mouse') return;
        p = { x: l.x, y: l.y, sx: l.x, sy: l.y, down: false, downAt: 0, travel: 0, speed: 0, active: true, gather: 0, gatherR: 0, gathering: false, type: 'mouse' };
        pointers.set(e.pointerId, p);
      }
      var mv = Math.hypot(l.x - p.x, l.y - p.y);
      p.speed = Math.max(p.speed, mv);
      if (p.down) p.travel = Math.max(p.travel, Math.hypot(l.x - p.sx, l.y - p.sy));
      p.x = l.x; p.y = l.y;
    }

    function release(p) {
      if (p.gather > 0.2) {
        for (var i = 0; i < N; i++) {
          var qx = px[i] - p.x, qy = py[i] - p.y;
          var d = Math.sqrt(qx * qx + qy * qy) || 1;
          if (d < p.gatherR) {
            var c = smooth(1 - d / p.gatherR) * p.gather;
            var kick = (7 + Math.random() * 9) * c;
            vx[i] += (qx / d) * kick;
            vy[i] += (qy / d) * kick;
          }
        }
      }
    }

    function onUp(e) {
      lastInput = performance.now();
      var p = pointers.get(e.pointerId);
      if (!p) return;
      var dur = performance.now() - p.downAt;
      release(p);
      if (p.down && !p.gathering && p.travel < 12 && dur < 320 && e.type === 'pointerup') emit('tap', local(e));
      if (e.pointerType === 'mouse' && e.type === 'pointerup') {
        p.down = false; p.gathering = false; p.gather = 0; p.travel = 0;
      } else {
        pointers.delete(e.pointerId);
      }
    }

    function onLeave(e) {
      if (e.pointerType === 'mouse') {
        var p = pointers.get(e.pointerId);
        if (p && !p.down) pointers.delete(e.pointerId);
      }
    }

    function emit(name, data) {
      for (var i = 0; i < listeners.length; i++) if (listeners[i][0] === name) listeners[i][1](data);
    }

    function next() {
      wordIndex = (wordIndex + 1) % words.length;
      return setText(words[wordIndex]);
    }

    function onResize() {
      if (resize() && ready) {
        var targets = sample(text, N);
        assign(targets, performance.now(), false);
      }
    }

    function onVisibility() {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running && !paused) { running = true; lastFrame = 0; raf = requestAnimationFrame(frame); }
    }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    allocate(Math.round(Math.max(minCount, Math.min(maxCount, (W * H) / density))));
    scatterIntro();
    setText(text, true);
    raf = requestAnimationFrame(frame);

    return {
      setText: function (str) { return setText(str); },
      setAutoAdvance: function (ms) { autoAdvance = ms; },
      pause: function () { paused = true; running = false; cancelAnimationFrame(raf); },
      resume: function () { paused = false; if (!running && !document.hidden) { running = true; lastFrame = 0; raf = requestAnimationFrame(frame); } },
      next: next,
      on: function (name, fn) { listeners.push([name, fn]); },
      get count() { return N; },
      get text() { return text; },
      destroy: function () {
        running = false;
        cancelAnimationFrame(raf);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }

  window.ParticleText = ParticleText;
})();
