(function () {
  'use strict';

  var Lab = window.Lab;
  var canvas = document.getElementById('c');
  var hangBtn = document.getElementById('rehang');
  var reduced = Lab.reducedMotion;
  var touchFirst = Lab.isTouch;
  var FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  var BIG = '손맛';
  var SMALL = '잡아당기고, 놓고, 찢어 보세요';
  var BLUE = [47 / 255, 91 / 255, 234 / 255];
  var FOCAL = 1700;

  Lab.fitCanvas(canvas, 2);
  var opts = { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' };
  var gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (!gl) return;
  var aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');

  var VS = [
    'precision highp float;',
    'attribute vec3 aPos;',
    'attribute vec3 aNor;',
    'attribute vec2 aUv;',
    'uniform vec2 uView;',
    'uniform vec2 uCenter;',
    'uniform float uFocal;',
    'uniform float uShadow;',
    'uniform vec2 uShadowOff;',
    'varying vec3 vNor;',
    'varying vec2 vUv;',
    'varying float vLift;',
    'void main () {',
    '  vec3 p = aPos;',
    '  float lift = max(-p.z, 0.0);',
    '  float depth = p.z / 4000.0;',
    '  if (uShadow > 0.5) {',
    '    p.xy += uShadowOff * (1.0 + lift * 0.03);',
    '    p.z = 0.0;',
    '    depth = 0.6;',
    '  }',
    '  float s = uFocal / (uFocal + p.z);',
    '  vec2 sp = uCenter + (p.xy - uCenter) * s;',
    '  vec2 c = sp / uView * 2.0 - 1.0;',
    '  gl_Position = vec4(c.x, -c.y, depth, 1.0);',
    '  vNor = aNor;',
    '  vUv = aUv;',
    '  vLift = lift;',
    '}'
  ].join('\n');

  var FS = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform float uShadow;',
    'uniform float uAlpha;',
    'uniform vec3 uLight;',
    'uniform vec3 uBase;',
    'varying vec3 vNor;',
    'varying vec2 vUv;',
    'varying float vLift;',
    'void main () {',
    '  if (uShadow > 0.5) {',
    '    float a = uAlpha * (1.0 - 0.55 * smoothstep(0.0, 240.0, vLift));',
    '    gl_FragColor = vec4(0.08, 0.08, 0.09, a);',
    '    return;',
    '  }',
    '  vec3 n = normalize(vNor);',
    '  vec3 tex = texture2D(uTex, vUv).rgb;',
    '  float back = step(0.0, n.z);',
    '  n = mix(n, -n, back);',
    '  float diff = max(dot(n, uLight), 0.0);',
    '  float shade = 0.54 + 0.54 * diff;',
    '  vec3 col = mix(tex, mix(uBase, tex, 0.16), back) * shade * mix(1.0, 0.8, back);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var PIN_VS = [
    'precision highp float;',
    'attribute vec4 aPin;',
    'uniform vec2 uView;',
    'uniform vec2 uCenter;',
    'uniform float uFocal;',
    'uniform float uDpr;',
    'uniform vec2 uOff;',
    'uniform float uGrow;',
    'void main () {',
    '  vec3 p = aPin.xyz;',
    '  p.xy += uOff;',
    '  float s = uFocal / (uFocal + p.z);',
    '  vec2 sp = uCenter + (p.xy - uCenter) * s;',
    '  vec2 c = sp / uView * 2.0 - 1.0;',
    '  gl_Position = vec4(c.x, -c.y, -0.9, 1.0);',
    '  gl_PointSize = (aPin.w + uGrow) * uDpr * s;',
    '}'
  ].join('\n');

  var PIN_FS = [
    'precision mediump float;',
    'uniform vec4 uColor;',
    'uniform vec3 uInner;',
    'void main () {',
    '  vec2 q = gl_PointCoord * 2.0 - 1.0;',
    '  float r = length(q);',
    '  if (r > 1.0) discard;',
    '  float a = 1.0 - smoothstep(0.8, 1.0, r);',
    '  vec3 c = mix(uColor.rgb, uInner, 1.0 - smoothstep(0.38, 0.5, r));',
    '  gl_FragColor = vec4(c, uColor.a * a);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  function program(vs, fs, attrs) {
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    attrs.forEach(function (a, i) { gl.bindAttribLocation(p, i, a); });
    gl.linkProgram(p);
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p: p, u: u };
  }

  var clothProg = program(VS, FS, ['aPos', 'aNor', 'aUv']);
  var pinProg = program(PIN_VS, PIN_FS, ['aPin']);
  var pinBuf = gl.createBuffer();
  var pinData = new Float32Array(64 * 4);

  var light = (function () {
    var l = [-0.35, -0.55, -1.0];
    var m = Math.hypot(l[0], l[1], l[2]);
    return [l[0] / m, l[1] / m, l[2] / m];
  })();

  var tex = gl.createTexture();
  var layout = null;
  var cloths = [];
  var current = null;
  var flyingPins = [];
  var clock = 0;
  var fontsReady = false;

  function computeLayout() {
    var W = canvas.clientWidth || window.innerWidth;
    var H = canvas.clientHeight || window.innerHeight;
    var portrait = W / H < 0.9;
    var nx = portrait ? 26 : 44;
    var ny = portrait ? 36 : 30;
    var aspect = (nx - 1) / (ny - 1);
    var clothW = portrait ? Math.min(W * 0.84, H * 0.6 * aspect) : Math.min(W * 0.6, H * 0.6 * aspect);
    var clothH = clothW / aspect;
    var top = Math.max(portrait ? 104 : 92, (H - clothH) * 0.42);
    var pinCount = portrait ? 6 : 7;
    var pinCols = [];
    for (var k = 0; k < pinCount; k++) pinCols.push(Math.round(k * (nx - 1) / (pinCount - 1)));
    return {
      W: W, H: H, portrait: portrait, nx: nx, ny: ny,
      clothW: clothW, clothH: clothH, sp: clothW / (nx - 1),
      left: (W - clothW) / 2, top: top, pinCols: pinCols,
      scale: clothH / 540
    };
  }

  function drawTexture() {
    var L = layout;
    var tw = L.portrait ? 1024 : 2048;
    var th = L.portrait ? 2048 : 1024;
    var c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    var x = c.getContext('2d');
    x.fillStyle = '#2f5bea';
    x.fillRect(0, 0, tw, th);
    var i;
    for (i = 0; i < th; i += 3) {
      x.fillStyle = (i / 3) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,40,0.04)';
      x.fillRect(0, i, tw, 1);
    }
    for (i = 0; i < tw; i += 3) {
      x.fillStyle = (i / 3) % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,40,0.035)';
      x.fillRect(i, 0, 1, th);
    }
    for (i = 0; i < 1400; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,30,0.05)';
      x.fillRect(Math.random() * tw, Math.random() * th, 6 + Math.random() * 46, 1);
    }
    var cw = L.clothW, ch = L.clothH, m = Math.min(cw, ch);
    x.save();
    x.scale(tw / cw, th / ch);
    var inset = m * 0.035;
    x.strokeStyle = 'rgba(255,255,255,0.34)';
    x.lineWidth = Math.max(0.7, m * 0.0028);
    x.setLineDash([m * 0.012, m * 0.009]);
    x.strokeRect(inset, inset, cw - inset * 2, ch - inset * 2);
    x.setLineDash([]);
    if (fontsReady) {
      x.fillStyle = '#ffffff';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      var big = 100;
      x.font = '900 ' + big + 'px ' + FONT;
      var mw = x.measureText(BIG).width || big * 1.9;
      big = Math.min(big * cw * (L.portrait ? 0.72 : 0.54) / mw, ch * (L.portrait ? 0.34 : 0.5));
      x.font = '900 ' + big + 'px ' + FONT;
      x.fillText(BIG, cw / 2, ch * (L.portrait ? 0.44 : 0.45));
      var small = L.portrait ? cw * 0.052 : cw * 0.025;
      x.font = '600 ' + small + 'px ' + FONT;
      x.fillStyle = 'rgba(255,255,255,0.9)';
      x.fillText(SMALL, cw / 2, ch * (L.portrait ? 0.75 : 0.79));
    }
    x.restore();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
  }

  function easeOut(t) {
    t = Math.min(Math.max(t, 0), 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function Cloth(L) {
    var nx = L.nx, ny = L.ny, n = nx * ny, sp = L.sp;
    this.L = L;
    this.nx = nx;
    this.ny = ny;
    this.n = n;
    this.sp = sp;
    this.g = 2300 * L.scale;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    this.inv = new Float32Array(n);
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.age = 0;
    this.dropped = false;
    this.dirty = true;
    this.indexCount = 0;
    var uv = new Float32Array(n * 2);
    var ca = [], cb = [], rest = [];
    var H = new Int32Array(n).fill(-1), V = new Int32Array(n).fill(-1), D1 = new Int32Array(n).fill(-1), D2 = new Int32Array(n).fill(-1);
    function add(a, b, r) { ca.push(a); cb.push(b); rest.push(r); return ca.length - 1; }
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        var k = j * nx + i;
        uv[k * 2] = i / (nx - 1);
        uv[k * 2 + 1] = j / (ny - 1);
        this.inv[k] = 1;
        if (i < nx - 1) H[k] = add(k, k + 1, sp);
        if (j < ny - 1) V[k] = add(k, k + nx, sp);
        if (i < nx - 1 && j < ny - 1) {
          D1[k] = add(k, k + nx + 1, sp * Math.SQRT2);
          D2[k] = add(k + 1, k + nx, sp * Math.SQRT2);
        }
      }
    }
    this.ca = new Int32Array(ca);
    this.cb = new Int32Array(cb);
    this.rest = new Float32Array(rest);
    this.alive = new Uint8Array(ca.length).fill(1);
    this.H = H; this.V = V; this.D1 = D1; this.D2 = D2;
    this.indices = new Uint16Array((nx - 1) * (ny - 1) * 6);

    var R0 = Math.max(sp * 1.6, L.clothH * 0.06);
    var gap = sp * 0.16;
    var h0 = sp;
    this.drop = L.top + R0 * 1.55;
    var cx = L.W / 2;
    for (j = 0; j < ny; j++) {
      var s = j * sp, y, z;
      if (s <= h0) {
        y = L.top + s;
        z = -1;
      } else {
        var phi = (s - h0) / R0;
        var R = Math.max(R0 * 0.35, R0 - gap * phi / (Math.PI * 2));
        y = L.top + h0 + R * Math.sin(phi);
        z = -R0 + R * Math.cos(phi) - 1;
      }
      for (i = 0; i < nx; i++) {
        k = j * nx + i;
        this.pos[k * 3] = cx + (i * sp - L.clothW / 2) * (j === 0 ? 0.955 : 0.97);
        this.pos[k * 3 + 1] = y - this.drop;
        this.pos[k * 3 + 2] = z;
      }
    }
    this.prev.set(this.pos);

    this.pins = L.pinCols.map(function (col) {
      var k = col;
      var cons = [];
      for (var c = 0; c < this.ca.length; c++) if (this.ca[c] === k || this.cb[c] === k) cons.push(c);
      this.inv[k] = 0;
      return { k: k, x: cx + (col * sp - L.clothW / 2) * 0.955, y: L.top, cons: cons, stretch: 1, popped: false };
    }, this);

    this.posBuf = gl.createBuffer();
    this.norBuf = gl.createBuffer();
    this.uvBuf = gl.createBuffer();
    this.idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.pos.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.norBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.nor.byteLength, gl.DYNAMIC_DRAW);
    this.computeNormals();
  }

  Cloth.prototype.pinY = function (pin) {
    var t = this.age / 0.75;
    return pin.y - this.drop * (1 - easeOut(t));
  };

  Cloth.prototype.popPin = function (pin, kick) {
    if (pin.popped) return;
    pin.popped = true;
    this.inv[pin.k] = 1;
    var p = this.pos;
    flyingPins.push({
      x: p[pin.k * 3], y: p[pin.k * 3 + 1], z: -2,
      vx: (Math.random() - 0.5) * 260 + (kick ? kick[0] * 0.15 : 0),
      vy: -260 - Math.random() * 160,
      vz: -200 - Math.random() * 200,
      life: 0
    });
  };

  Cloth.prototype.dropAll = function () {
    this.dropped = true;
    for (var i = 0; i < this.pins.length; i++) this.popPin(this.pins[i]);
  };

  Cloth.prototype.wind = function (t) {
    var amp = (reduced ? 0.35 : 1) * 520 * this.L.scale;
    var gust = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.41) * 0.6 + Math.sin(t * 0.93 + 1.7) * 0.4);
    return { amp: amp * gust, wx: Math.sin(t * 0.23) * 0.35 };
  };

  Cloth.prototype.step = function (dt, ptrs, iters) {
    var pos = this.pos, prev = this.prev, inv = this.inv, nor = this.nor, n = this.n;
    this.age += dt;
    var dt2 = dt * dt;
    var g = this.g * dt2;
    var damp = 0.994;
    var w = this.wind(clock);
    var k, i3;
    for (k = 0; k < n; k++) {
      if (inv[k] === 0) continue;
      i3 = k * 3;
      var x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
      var vx = (x - prev[i3]) * damp, vy = (y - prev[i3 + 1]) * damp, vz = (z - prev[i3 + 2]) * damp;
      prev[i3] = x;
      prev[i3 + 1] = y;
      prev[i3 + 2] = z;
      var ripple = 0.65 + 0.35 * Math.sin(x * 0.009 - clock * 2.1 + y * 0.004) * Math.sin(y * 0.011 + clock * 1.3);
      var wz = -w.amp * ripple, wx = w.amp * w.wx;
      var nx0 = nor[i3], ny0 = nor[i3 + 1], nz0 = nor[i3 + 2];
      var d = nx0 * wx + nz0 * wz;
      pos[i3] = x + vx + nx0 * d * dt2;
      pos[i3 + 1] = y + vy + g + ny0 * d * dt2;
      pos[i3 + 2] = z + vz + nz0 * d * dt2;
    }

    for (var pi = 0; pi < this.pins.length; pi++) {
      var pin = this.pins[pi];
      if (pin.popped) continue;
      i3 = pin.k * 3;
      var py = this.pinY(pin);
      prev[i3] = pos[i3];
      prev[i3 + 1] = pos[i3 + 1];
      prev[i3 + 2] = pos[i3 + 2];
      pos[i3] = pin.x;
      pos[i3 + 1] = py;
      pos[i3 + 2] = 0;
    }

    var cxv = this.L.W / 2, cyv = this.L.H / 2;
    ptrs.forEach(function (p) {
      if (!p.grab || p.cloth !== this) return;
      for (var q = 0; q < p.grab.length; q++) {
        var gk = p.grab[q];
        var j3 = gk.k * 3;
        var zc = pos[j3 + 2];
        var sc = (FOCAL + zc) / FOCAL;
        var tx = cxv + (p.sx + gk.ox - cxv) * sc;
        var ty = cyv + (p.sy + gk.oy - cyv) * sc;
        var tz = Math.min(zc, -p.lift * gk.w);
        var a = gk.w * 0.7;
        if (inv[gk.k] === 0) continue;
        pos[j3] += (tx - pos[j3]) * a;
        pos[j3 + 1] += (ty - pos[j3 + 1]) * a;
        pos[j3 + 2] += (tz - zc) * a * 0.35;
      }
    }, this);

    var ca = this.ca, cb = this.cb, rest = this.rest, alive = this.alive, m = ca.length;
    var TEAR = 3.1;
    for (var it = 0; it < iters; it++) {
      var last = it === iters - 1;
      for (var c = 0; c < m; c++) {
        if (!alive[c]) continue;
        var ia = ca[c], ib = cb[c];
        var wa = inv[ia], wb = inv[ib], ws = wa + wb;
        if (ws === 0) continue;
        var a3 = ia * 3, b3 = ib * 3;
        var dx = pos[b3] - pos[a3], dy = pos[b3 + 1] - pos[a3 + 1], dz = pos[b3 + 2] - pos[a3 + 2];
        var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (last && len > rest[c] * TEAR && this.age > 1.4) {
          alive[c] = 0;
          this.dirty = true;
          continue;
        }
        var f = (len - rest[c]) / (len * ws);
        pos[a3] += dx * f * wa;
        pos[a3 + 1] += dy * f * wa;
        pos[a3 + 2] += dz * f * wa;
        pos[b3] -= dx * f * wb;
        pos[b3 + 1] -= dy * f * wb;
        pos[b3 + 2] -= dz * f * wb;
      }
      for (k = 0; k < n; k++) {
        i3 = k * 3;
        if (pos[i3 + 2] > 0) {
          pos[i3 + 2] = 0;
          prev[i3] += (pos[i3] - prev[i3]) * 0.25;
          prev[i3 + 1] += (pos[i3 + 1] - prev[i3 + 1]) * 0.25;
        }
      }
    }

    if (this.age > 1.2 && !this.dropped) {
      for (pi = 0; pi < this.pins.length; pi++) {
        pin = this.pins[pi];
        if (pin.popped) continue;
        var worst = 0;
        for (var q = 0; q < pin.cons.length; q++) {
          var ci = pin.cons[q];
          if (!alive[ci]) continue;
          var ia2 = ca[ci] * 3, ib2 = cb[ci] * 3;
          var l2 = Math.hypot(pos[ib2] - pos[ia2], pos[ib2 + 1] - pos[ia2 + 1], pos[ib2 + 2] - pos[ia2 + 2]) / rest[ci];
          if (l2 > worst) worst = l2;
        }
        pin.stretch = pin.stretch * 0.8 + worst * 0.2;
        if (pin.stretch > 1.5) this.popPin(pin);
      }
    }
  };

  Cloth.prototype.computeNormals = function () {
    var pos = this.pos, nor = this.nor, nx = this.nx, ny = this.ny;
    for (var j = 0; j < ny; j++) {
      var j0 = j > 0 ? j - 1 : j, j1 = j < ny - 1 ? j + 1 : j;
      for (var i = 0; i < nx; i++) {
        var i0 = i > 0 ? i - 1 : i, i1 = i < nx - 1 ? i + 1 : i;
        var a = (j * nx + i0) * 3, b = (j * nx + i1) * 3, c = (j0 * nx + i) * 3, d = (j1 * nx + i) * 3;
        var ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
        var vx = pos[d] - pos[c], vy = pos[d + 1] - pos[c + 1], vz = pos[d + 2] - pos[c + 2];
        var x = vy * uz - vz * uy, y = vz * ux - vx * uz, z = vx * uy - vy * ux;
        var m = Math.sqrt(x * x + y * y + z * z) || 1;
        var k = (j * nx + i) * 3;
        nor[k] = x / m;
        nor[k + 1] = y / m;
        nor[k + 2] = z / m;
      }
    }
  };

  Cloth.prototype.rebuildIndices = function () {
    var nx = this.nx, ny = this.ny, al = this.alive, idx = this.indices, c = 0;
    var H = this.H, V = this.V, D1 = this.D1, D2 = this.D2;
    function ok(e) { return e >= 0 && al[e] === 1; }
    for (var j = 0; j < ny - 1; j++) {
      for (var i = 0; i < nx - 1; i++) {
        var a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1;
        if (ok(D2[a])) {
          if (ok(H[a]) && ok(V[a])) { idx[c++] = a; idx[c++] = b; idx[c++] = cc; }
          if (ok(V[b]) && ok(H[cc])) { idx[c++] = b; idx[c++] = d; idx[c++] = cc; }
        } else if (ok(D1[a])) {
          if (ok(H[a]) && ok(V[b])) { idx[c++] = a; idx[c++] = b; idx[c++] = d; }
          if (ok(H[cc]) && ok(V[a])) { idx[c++] = a; idx[c++] = d; idx[c++] = cc; }
        }
      }
    }
    this.indexCount = c;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
    this.dirty = false;
  };

  Cloth.prototype.project = function () {
    var pos = this.pos, n = this.n, cxv = this.L.W / 2, cyv = this.L.H / 2;
    for (var k = 0; k < n; k++) {
      var s = FOCAL / (FOCAL + pos[k * 3 + 2]);
      this.sx[k] = cxv + (pos[k * 3] - cxv) * s;
      this.sy[k] = cyv + (pos[k * 3 + 1] - cyv) * s;
    }
  };

  Cloth.prototype.pick = function (x, y, R) {
    this.project();
    var out = [], best = Infinity;
    for (var k = 0; k < this.n; k++) {
      var d = Math.hypot(this.sx[k] - x, this.sy[k] - y);
      if (d < best) best = d;
      if (d < R) {
        var w = 1 - d / R;
        out.push({ k: k, w: w * w * (3 - 2 * w), ox: this.sx[k] - x, oy: this.sy[k] - y });
      }
    }
    if (best > Math.max(this.sp * 1.6, R * 0.45)) return null;
    return out.length ? out : null;
  };

  Cloth.prototype.nudge = function (x, y, R, fx, fy, fz) {
    this.project();
    var pos = this.pos, inv = this.inv;
    for (var k = 0; k < this.n; k++) {
      if (inv[k] === 0) continue;
      var d = Math.hypot(this.sx[k] - x, this.sy[k] - y);
      if (d >= R) continue;
      var w = 1 - d / R;
      w = w * w;
      pos[k * 3] += fx * w;
      pos[k * 3 + 1] += fy * w;
      pos[k * 3 + 2] += fz * w;
    }
  };

  function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
    var den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (den === 0) return false;
    var t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
    var u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  Cloth.prototype.cut = function (x1, y1, x2, y2) {
    this.project();
    var ca = this.ca, cb = this.cb, al = this.alive, sx = this.sx, sy = this.sy, hits = 0;
    var minx = Math.min(x1, x2) - 2, maxx = Math.max(x1, x2) + 2, miny = Math.min(y1, y2) - 2, maxy = Math.max(y1, y2) + 2;
    for (var c = 0; c < ca.length; c++) {
      if (!al[c]) continue;
      var a = ca[c], b = cb[c];
      if (Math.max(sx[a], sx[b]) < minx || Math.min(sx[a], sx[b]) > maxx || Math.max(sy[a], sy[b]) < miny || Math.min(sy[a], sy[b]) > maxy) continue;
      if (segHit(x1, y1, x2, y2, sx[a], sy[a], sx[b], sy[b])) {
        al[c] = 0;
        hits++;
      }
    }
    if (hits) {
      this.dirty = true;
      var dx = x2 - x1, dy = y2 - y1, m = Math.hypot(dx, dy) || 1;
      this.nudge((x1 + x2) / 2, (y1 + y2) / 2, m * 0.6 + 30, dx / m * 3, dy / m * 3, -6);
    }
    return hits;
  };

  Cloth.prototype.offscreen = function () {
    var pos = this.pos, lim = this.L.H + 160;
    for (var k = 0; k < this.n; k++) if (pos[k * 3 + 1] < lim) return false;
    return true;
  };

  Cloth.prototype.dispose = function () {
    gl.deleteBuffer(this.posBuf);
    gl.deleteBuffer(this.norBuf);
    gl.deleteBuffer(this.uvBuf);
    gl.deleteBuffer(this.idxBuf);
  };

  function hang() {
    if (current) current.dropAll();
    current = new Cloth(layout);
    cloths.push(current);
  }

  function setup() {
    layout = computeLayout();
    drawTexture();
    cloths.forEach(function (c) { c.dispose(); });
    cloths = [];
    current = null;
    hang();
  }

  var pointers = new Map();
  var lastTap = { t: -10, x: 0, y: 0 };
  var SLASH_SPEED = 1300;

  function local(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function grabRadius() {
    return (touchFirst ? 1.25 : 1) * Math.max(56, Math.min(layout.clothW, layout.clothH) * 0.15);
  }

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  canvas.addEventListener('pointerdown', function (e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    Lab.dismissHint();
    var q = local(e);
    var p = {
      sx: q.x, sy: q.y, lx: q.x, ly: q.y, lt: performance.now(), t0: clock,
      travel: 0, grab: null, cloth: null, cutting: false, down: true,
      lift: 34 * layout.scale, mouse: e.pointerType === 'mouse'
    };
    if (current && !current.dropped) {
      p.grab = current.pick(q.x, q.y, grabRadius());
      p.cloth = current;
      if (p.grab) current.nudge(q.x, q.y, grabRadius(), 0, 0, -7 * layout.scale);
    }
    pointers.set(e.pointerId, p);
  });

  canvas.addEventListener('pointermove', function (e) {
    var q = local(e);
    var p = pointers.get(e.pointerId);
    var now = performance.now();
    if (!p) {
      if (e.pointerType === 'mouse' && current && !current.dropped) {
        var hv = hoverState;
        if (hv.has) {
          var mdx = q.x - hv.x, mdy = q.y - hv.y, md = Math.hypot(mdx, mdy);
          if (md > 0.5 && md < 200) current.nudge(q.x, q.y, grabRadius() * 1.1, mdx * 0.05, mdy * 0.05, -Math.min(md, 40) * 0.07 * layout.scale);
        }
        hv.has = true;
        hv.x = q.x;
        hv.y = q.y;
      }
      return;
    }
    var dist = Math.hypot(q.x - p.lx, q.y - p.ly);
    var dtE = Math.max(now - p.lt, 8) / 1000;
    var speed = dist / dtE;
    p.travel += dist;
    if (!p.cutting && speed > SLASH_SPEED && dist > 6) {
      p.cutting = true;
      p.grab = null;
    }
    if (p.cutting && current && !current.dropped) current.cut(p.lx, p.ly, q.x, q.y);
    p.lx = q.x;
    p.ly = q.y;
    p.lt = now;
    p.sx = q.x;
    p.sy = q.y;
  });

  var hoverState = { has: false, x: 0, y: 0 };
  canvas.addEventListener('pointerleave', function () { hoverState.has = false; });

  function release(e) {
    var p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (e.type !== 'pointerup') return;
    var dur = clock - p.t0;
    if (dur < 0.3 && p.travel < 12) {
      if (current && !current.dropped) current.nudge(p.sx, p.sy, grabRadius() * 1.3, 0, 0, -16 * layout.scale);
      var gap = clock - lastTap.t;
      if (gap < 0.34 && Math.hypot(p.sx - lastTap.x, p.sy - lastTap.y) < 50) {
        hang();
        lastTap.t = -10;
      } else {
        lastTap = { t: clock, x: p.sx, y: p.sy };
      }
    }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  hangBtn.addEventListener('click', function () { hang(); });

  function drawCloth(c, shadow) {
    var u = clothProg.u;
    gl.uniform1f(u.uShadow, shadow ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.posBuf);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.norBuf);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.uvBuf);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.idxBuf);
    gl.drawElements(gl.TRIANGLES, c.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  function render() {
    var dpr = canvas.width / Math.max(1, layout.W);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.945, 0.933, 0.906, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    gl.useProgram(clothProg.p);
    var u = clothProg.u;
    gl.uniform2f(u.uView, layout.W, layout.H);
    gl.uniform2f(u.uCenter, layout.W / 2, layout.H / 2);
    gl.uniform1f(u.uFocal, FOCAL);
    gl.uniform2f(u.uShadowOff, 5 * layout.scale, 9 * layout.scale);
    gl.uniform1f(u.uAlpha, 0.1);
    gl.uniform3f(u.uLight, light[0], light[1], light[2]);
    gl.uniform3f(u.uBase, BLUE[0], BLUE[1], BLUE[2]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.uTex, 0);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);

    cloths.forEach(function (c) {
      c.computeNormals();
      if (c.dirty) c.rebuildIndices();
      gl.bindBuffer(gl.ARRAY_BUFFER, c.posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, c.pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, c.norBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, c.nor);
    });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    cloths.forEach(function (c) { drawCloth(c, true); });
    gl.disable(gl.BLEND);
    cloths.forEach(function (c) { drawCloth(c, false); });
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);

    var count = 0;
    cloths.forEach(function (c) {
      c.pins.forEach(function (pin) {
        if (pin.popped || count >= 60) return;
        var k = pin.k * 3;
        pinData[count * 4] = c.pos[k];
        pinData[count * 4 + 1] = c.pos[k + 1];
        pinData[count * 4 + 2] = -1;
        pinData[count * 4 + 3] = 9 * Math.max(0.8, layout.scale);
        count++;
      });
    });
    flyingPins.forEach(function (f) {
      if (count >= 60) return;
      pinData[count * 4] = f.x;
      pinData[count * 4 + 1] = f.y;
      pinData[count * 4 + 2] = f.z;
      pinData[count * 4 + 3] = 9 * Math.max(0.8, layout.scale);
      count++;
    });
    if (count) {
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.useProgram(pinProg.p);
      var pu = pinProg.u;
      gl.uniform2f(pu.uView, layout.W, layout.H);
      gl.uniform2f(pu.uCenter, layout.W / 2, layout.H / 2);
      gl.uniform1f(pu.uFocal, FOCAL);
      gl.uniform1f(pu.uDpr, dpr);
      gl.bindBuffer(gl.ARRAY_BUFFER, pinBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pinData.subarray(0, count * 4), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.uniform2f(pu.uOff, 1.5, 2.5);
      gl.uniform1f(pu.uGrow, 2);
      gl.uniform4f(pu.uColor, 0.08, 0.08, 0.08, 0.16);
      gl.uniform3f(pu.uInner, 0.08, 0.08, 0.08);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.uniform2f(pu.uOff, 0, 0);
      gl.uniform1f(pu.uGrow, 0);
      gl.uniform4f(pu.uColor, 0.1, 0.1, 0.1, 1);
      gl.uniform3f(pu.uInner, 0.22, 0.22, 0.22);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.disable(gl.BLEND);
    }
  }

  var STEP = 1 / 120;
  var acc = 0;
  var iters = 4;
  var perf = { n: 0, sum: 0, done: false };
  var raf = 0;
  var lastT = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var raw = lastT ? (now - lastT) / 1000 : 1 / 60;
    lastT = now;
    if (Lab.fitCanvas(canvas, 2)) {
      var nl = computeLayout();
      if (!layout || Math.abs(nl.W - layout.W) > 1 || Math.abs(nl.H - layout.H) > 1) setup();
    }
    var dt = Math.min(raw, 1 / 20);
    if (!perf.done && clock > 1) {
      perf.sum += raw;
      perf.n++;
      if (perf.n >= 60) {
        perf.done = true;
        if (perf.sum / perf.n > 0.024) iters = 3;
      }
    }
    acc += dt;
    var steps = 0;
    while (acc >= STEP && steps < 4) {
      clock += STEP;
      for (var i = 0; i < cloths.length; i++) cloths[i].step(STEP, pointers, iters);
      for (var f = flyingPins.length - 1; f >= 0; f--) {
        var fp = flyingPins[f];
        fp.vy += 2200 * STEP;
        fp.x += fp.vx * STEP;
        fp.y += fp.vy * STEP;
        fp.z = Math.min(fp.z + fp.vz * STEP, 0);
        fp.life += STEP;
        if (fp.y > layout.H + 60 || fp.life > 4) flyingPins.splice(f, 1);
      }
      acc -= STEP;
      steps++;
    }
    if (steps === 4) acc = 0;
    for (var c = cloths.length - 1; c >= 0; c--) {
      if (cloths[c] !== current && cloths[c].dropped && cloths[c].age > 1 && cloths[c].offscreen()) {
        cloths[c].dispose();
        cloths.splice(c, 1);
      }
    }
    render();
  }

  setup();

  var fontTimeout = new Promise(function (r) { setTimeout(r, 1500); });
  var fontLoad = document.fonts && document.fonts.load
    ? Promise.all([
      document.fonts.load('900 100px "Pretendard Variable"', BIG),
      document.fonts.load('600 20px "Pretendard Variable"', SMALL)
    ]).catch(function () {})
    : Promise.resolve();
  Promise.race([fontLoad, fontTimeout]).then(function () {
    fontsReady = true;
    drawTexture();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      lastT = 0;
      raf = requestAnimationFrame(frame);
    }
  });

  raf = requestAnimationFrame(frame);
})();
