(function () {
  var M = Matter;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  var PALETTE = [
    { fill: '#141414', text: '#f1eee7' },
    { fill: '#2f5bea', text: '#ffffff' },
    { fill: '#ffffff', text: '#141414', line: true },
    { fill: '#e5482d', text: '#ffffff' },
    { fill: '#f2c230', text: '#141414' }
  ];
  var LINES_WIDE = ['만지고 싶은', '웹사이트'];
  var LINES_NARROW = ['만지고', '싶은', '웹사이트'];
  var PILLS = ['와우', '디테일', '손맛', '끝판왕', '인터랙션'];
  var SYLLABLES = ['와', '우', '손', '맛', '웹', '짱'];
  var MAX_BODIES = 46;

  var engine = M.Engine.create({ positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1;
  engine.gravity.scale = 0.0011;
  var world = engine.world;

  var W = 0, H = 0, dpr = 1, unit = 100, floorY = 0;
  var walls = [];
  var ceiling = null;
  var tiles = [];
  var grabs = new Map();
  var taps = new Map();
  var floating = false;
  var tilt = null;
  var running = true;
  var raf = 0, lastFrame = 0, acc = 0;
  var introTimers = [];
  var colorCursor = 0;

  var floatBtn = document.querySelector('.drop-float');
  var resetBtn = document.querySelector('.drop-reset');
  var tiltBtn = document.querySelector('.drop-tilt');

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var narrow = W / H < 0.85;
    unit = narrow ? Math.max(56, Math.min(110, W / 4.9)) : Math.max(64, Math.min(150, Math.min(W / 7.4, H / 4.6)));
    floorY = H - (narrow ? 104 : 86);
    buildWalls();
  }

  function buildWalls() {
    if (walls.length) M.Composite.remove(world, walls);
    var t = 400;
    var opts = { isStatic: true, friction: 0.6, restitution: 0.2 };
    walls = [
      M.Bodies.rectangle(W / 2, floorY + t / 2, W + t * 2, t, opts),
      M.Bodies.rectangle(-t / 2, H / 2 - H, t, H * 4, opts),
      M.Bodies.rectangle(W + t / 2, H / 2 - H, t, H * 4, opts)
    ];
    M.Composite.add(world, walls);
    if (ceiling) setCeiling(true);
  }

  function setCeiling(on) {
    if (ceiling) { M.Composite.remove(world, ceiling); ceiling = null; }
    if (on) {
      ceiling = M.Bodies.rectangle(W / 2, -200, W + 800, 400, { isStatic: true, restitution: 0.6 });
      M.Composite.add(world, ceiling);
    }
  }

  function nextColor() {
    var c = PALETTE[colorCursor % PALETTE.length];
    colorCursor++;
    return c;
  }

  function measure(label, size) {
    ctx.font = '800 ' + size + 'px ' + FONT;
    return ctx.measureText(label).width;
  }

  function makeTile(kind, label, x, y, color) {
    var body, w, h, font;
    var common = { restitution: 0.3, friction: 0.45, frictionAir: 0.008, density: 0.0016 };
    if (kind === 'syllable') {
      w = h = unit;
      font = unit * 0.6;
      body = M.Bodies.rectangle(x, y, w, h, Object.assign({ chamfer: { radius: unit * 0.2 } }, common));
    } else if (kind === 'pill') {
      h = unit * 0.66;
      font = h * 0.5;
      w = measure(label, font) + h * 1.1;
      body = M.Bodies.rectangle(x, y, w, h, Object.assign({ chamfer: { radius: h / 2 - 0.5 } }, common));
    } else {
      w = h = unit * (0.5 + Math.random() * 0.45);
      font = 0;
      body = M.Bodies.circle(x, y, w / 2, Object.assign({}, common, { restitution: 0.45 }));
    }
    body.plugin.tile = { kind: kind, label: label, w: w, h: h, font: font, color: color, born: performance.now(), scale: 0, dying: 0, live: false };
    return body;
  }

  function release(body, vx, vy) {
    var t = body.plugin.tile;
    if (t.live) return;
    t.live = true;
    M.Composite.add(world, body);
    M.Body.setVelocity(body, { x: vx || 0, y: vy || 0 });
    M.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05);
  }

  function clearAll() {
    introTimers.forEach(clearTimeout);
    introTimers = [];
    grabs.forEach(function (g) { M.Composite.remove(world, g.c); });
    grabs.clear();
    tiles.forEach(function (b) { if (b.plugin.tile.live) M.Composite.remove(world, b); });
    tiles = [];
    colorCursor = 0;
  }

  function intro() {
    clearAll();
    var narrow = W / H < 0.85;
    var lines = narrow ? LINES_NARROW : LINES_WIDE;
    var gap = unit * 0.1;
    var lineH = unit + gap;
    var top = H * (narrow ? 0.2 : 0.22) + unit / 2;
    var order = 0;
    var now = performance.now();
    lines.forEach(function (line, li) {
      var slots = [];
      var cursor = 0;
      Array.from(line).forEach(function (ch) {
        if (ch === ' ') { cursor += unit * 0.42; return; }
        slots.push({ ch: ch, x: cursor + unit / 2 });
        cursor += unit + gap;
      });
      var x0 = W / 2 - (cursor - gap) / 2;
      slots.forEach(function (slot) {
        var b = makeTile('syllable', slot.ch, x0 + slot.x, top + li * lineH, nextColor());
        M.Body.setAngle(b, (Math.random() - 0.5) * 0.04);
        b.plugin.tile.born = now + order * 55;
        tiles.push(b);
        order++;
      });
    });
    var holdUntil = order * 55 + 900;
    var releaseOrder = tiles.slice().sort(function () { return Math.random() - 0.5; });
    releaseOrder.forEach(function (b, i) {
      introTimers.push(setTimeout(function () {
        release(b, (Math.random() - 0.5) * 1.5, 0);
      }, holdUntil + i * 85));
    });
    introTimers.push(setTimeout(function () {
      for (var k = 0; k < 4; k++) spawnExtra(W * (0.2 + Math.random() * 0.6), -unit * (1 + k), true);
    }, holdUntil + releaseOrder.length * 85 + 300));
  }

  function spawnExtra(x, y, quiet) {
    var r = Math.random();
    var b;
    if (r < 0.45) b = makeTile('pill', PILLS[(Math.random() * PILLS.length) | 0], x, y, nextColor());
    else if (r < 0.75) b = makeTile('circle', '', x, y, nextColor());
    else b = makeTile('syllable', SYLLABLES[(Math.random() * SYLLABLES.length) | 0], x, y, nextColor());
    b.plugin.tile.born = performance.now();
    b.plugin.tile.extra = true;
    tiles.push(b);
    release(b, (Math.random() - 0.5) * 2, quiet ? 2 : 4);
    var extras = tiles.filter(function (t) { return t.plugin.tile.live && !t.plugin.tile.dying; });
    if (extras.length > MAX_BODIES) {
      var oldest = extras.find(function (t) { return t.plugin.tile.extra; }) || extras[0];
      oldest.plugin.tile.dying = performance.now();
    }
  }

  function local(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function bodyAt(pt) {
    var live = tiles.filter(function (b) { return b.plugin.tile.live && !b.plugin.tile.dying; });
    var hit = M.Query.point(live, pt);
    if (hit.length) return hit[hit.length - 1];
    var best = null, bestD = (unit * 0.25) * (unit * 0.25);
    live.forEach(function (b) {
      var dx = b.position.x - pt.x, dy = b.position.y - pt.y;
      var reach = Math.max(b.plugin.tile.w, b.plugin.tile.h) / 2 + unit * 0.18;
      var d = dx * dx + dy * dy;
      if (d < reach * reach && d < bestD + reach * reach) { best = b; bestD = d; }
    });
    return best;
  }

  canvas.addEventListener('pointerdown', function (e) {
    var pt = local(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var body = bodyAt(pt);
    if (body) {
      var c = M.Constraint.create({
        pointA: { x: pt.x, y: pt.y },
        bodyB: body,
        pointB: { x: pt.x - body.position.x, y: pt.y - body.position.y },
        stiffness: 0.16,
        damping: 0.08,
        length: 0
      });
      M.Composite.add(world, c);
      grabs.set(e.pointerId, { c: c, body: body });
      body.plugin.tile.grabbed = true;
    } else {
      taps.set(e.pointerId, { x: pt.x, y: pt.y, t: performance.now() });
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    var g = grabs.get(e.pointerId);
    if (!g) return;
    var pt = local(e);
    g.c.pointA.x = pt.x;
    g.c.pointA.y = pt.y;
  });

  function end(e) {
    var g = grabs.get(e.pointerId);
    if (g) {
      M.Composite.remove(world, g.c);
      g.body.plugin.tile.grabbed = false;
      var v = g.body.velocity;
      var sp = Math.hypot(v.x, v.y), cap = 38;
      if (sp > cap) M.Body.setVelocity(g.body, { x: v.x / sp * cap, y: v.y / sp * cap });
      grabs.delete(e.pointerId);
    }
    var t = taps.get(e.pointerId);
    if (t) {
      taps.delete(e.pointerId);
      var pt = local(e);
      if (e.type === 'pointerup' && performance.now() - t.t < 350 && Math.hypot(pt.x - t.x, pt.y - t.y) < 14) {
        spawnExtra(Math.max(unit, Math.min(W - unit, pt.x)), floating ? pt.y : -unit, false);
      }
    }
  }

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  floatBtn.addEventListener('click', function () {
    floating = !floating;
    floatBtn.setAttribute('aria-pressed', String(floating));
    Lab.dismissHint();
    if (floating) {
      setCeiling(true);
      tiles.forEach(function (b) {
        if (!b.plugin.tile.live) release(b, 0, 0);
        M.Body.setVelocity(b, { x: (Math.random() - 0.5) * 4, y: -(3 + Math.random() * 7) });
        M.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.08);
      });
    } else {
      setCeiling(false);
    }
  });

  resetBtn.addEventListener('click', function () {
    Lab.dismissHint();
    if (floating) floatBtn.click();
    intro();
  });

  function screenAngle() {
    var a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
    return a * Math.PI / 180;
  }

  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    var gx = Math.sin(e.gamma * Math.PI / 180);
    var gy = Math.sin(e.beta * Math.PI / 180);
    var a = screenAngle();
    tilt = { x: gx * Math.cos(a) + gy * Math.sin(a), y: gy * Math.cos(a) - gx * Math.sin(a) };
  }

  if ('DeviceOrientationEvent' in window && Lab.isTouch) {
    document.body.classList.add('can-tilt');
    tiltBtn.addEventListener('click', function () {
      if (tilt) {
        window.removeEventListener('deviceorientation', onOrientation);
        tilt = null;
        tiltBtn.setAttribute('aria-pressed', 'false');
        return;
      }
      var ask = typeof DeviceOrientationEvent.requestPermission === 'function' ? DeviceOrientationEvent.requestPermission() : Promise.resolve('granted');
      ask.then(function (state) {
        if (state !== 'granted') return;
        tilt = { x: 0, y: 1 };
        window.addEventListener('deviceorientation', onOrientation);
        tiltBtn.setAttribute('aria-pressed', 'true');
      }).catch(function () {});
    });
  }

  function physics() {
    if (floating) {
      engine.gravity.x = 0;
      engine.gravity.y = 0;
      var t = performance.now() * 0.0004;
      tiles.forEach(function (b, i) {
        if (!b.plugin.tile.live || b.plugin.tile.grabbed) return;
        M.Body.applyForce(b, b.position, { x: Math.sin(t + i * 1.7) * 0.000012 * b.mass, y: Math.cos(t * 1.3 + i) * 0.000012 * b.mass });
      });
    } else if (tilt) {
      engine.gravity.x = tilt.x;
      engine.gravity.y = tilt.y;
    } else {
      engine.gravity.x = 0;
      engine.gravity.y = 1;
    }
    M.Engine.update(engine, 1000 / 60);
    var now = performance.now();
    for (var i = tiles.length - 1; i >= 0; i--) {
      var b = tiles[i], tl = b.plugin.tile;
      if (tl.dying && now - tl.dying > 320) {
        if (tl.live) M.Composite.remove(world, b);
        tiles.splice(i, 1);
        continue;
      }
      if (tl.live && (b.position.y > floorY + unit * 4 || b.position.x < -unit * 4 || b.position.x > W + unit * 4 || b.position.y < -H * 3)) {
        M.Body.setPosition(b, { x: W / 2 + (Math.random() - 0.5) * W * 0.5, y: -unit });
        M.Body.setVelocity(b, { x: 0, y: 0 });
      }
    }
  }

  function roundRectPath(w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, r);
    else ctx.rect(-w / 2, -h / 2, w, h);
  }

  function drawTile(b, now) {
    var t = b.plugin.tile;
    var age = (now - t.born) / 420;
    if (age < 0) return;
    var s = easeOutCubic(Math.min(1, age));
    if (t.dying) s *= 1 - easeOutCubic(Math.min(1, (now - t.dying) / 320));
    if (s <= 0.001) return;
    var r = t.kind === 'syllable' ? unit * 0.2 : t.h / 2;
    var lift = t.grabbed ? 1.06 : 1;
    ctx.save();
    ctx.translate(b.position.x, b.position.y + unit * (t.grabbed ? 0.12 : 0.05));
    ctx.rotate(b.angle);
    ctx.scale(s * lift, s * lift);
    ctx.fillStyle = t.grabbed ? 'rgba(20,20,20,0.12)' : 'rgba(20,20,20,0.07)';
    if (t.kind === 'circle') { ctx.beginPath(); ctx.arc(0, 0, t.w / 2, 0, Math.PI * 2); } else roundRectPath(t.w, t.h, r);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.scale(s * lift, s * lift);
    ctx.fillStyle = t.color.fill;
    if (t.kind === 'circle') { ctx.beginPath(); ctx.arc(0, 0, t.w / 2, 0, Math.PI * 2); } else roundRectPath(t.w, t.h, r);
    ctx.fill();
    if (t.color.line) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(20,20,20,0.14)';
      ctx.stroke();
    }
    if (t.label) {
      ctx.fillStyle = t.color.text;
      ctx.font = '800 ' + t.font + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.label, 0, t.font * 0.05);
    }
    ctx.restore();
  }

  function drawGrabs() {
    grabs.forEach(function (g) {
      var b = g.body, c = g.c;
      var ax = b.position.x + c.pointB.x, ay = b.position.y + c.pointB.y;
      ctx.strokeStyle = 'rgba(20,20,20,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.pointA.x, c.pointA.y);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.arc(c.pointA.x, c.pointA.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(20,20,20,0.16)';
    ctx.fillRect(0, Math.round(floorY), W, 1);
    var now = performance.now();
    var grabbed = [];
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].plugin.tile.grabbed) grabbed.push(tiles[i]);
      else drawTile(tiles[i], now);
    }
    for (var j = 0; j < grabbed.length; j++) drawTile(grabbed[j], now);
    drawGrabs();
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    acc += Math.min(64, now - lastFrame);
    lastFrame = now;
    var steps = 0;
    while (acc >= 1000 / 60 && steps < 3) { physics(); acc -= 1000 / 60; steps++; }
    if (steps === 3) acc = 0;
    render();
  }

  window.addEventListener('resize', function () {
    var oldW = W;
    resize();
    tiles.forEach(function (b) {
      if (b.position.x > W - unit / 2) M.Body.setPosition(b, { x: W - unit, y: b.position.y });
      if (!b.plugin.tile.live && oldW) M.Body.setPosition(b, { x: b.position.x * W / oldW, y: b.position.y });
    });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
    else if (!running) { running = true; lastFrame = 0; raf = requestAnimationFrame(frame); }
  });

  resize();
  var allText = LINES_WIDE.join('') + PILLS.join('') + SYLLABLES.join('');
  var fontReady = document.fonts && document.fonts.load ? document.fonts.load('800 100px "Pretendard Variable"', allText) : Promise.resolve();
  Promise.race([fontReady, new Promise(function (r) { setTimeout(r, 1500); })]).catch(function () {}).then(function () {
    intro();
  });
  raf = requestAnimationFrame(frame);
})();
