(function () {
  'use strict';

  var Lab = window.Lab;
  var canvas = document.getElementById('c');
  var rewriteBtn = document.getElementById('rewrite');
  var touchFirst = Lab.isTouch;
  var reduced = Lab.reducedMotion;
  var WORD = '번짐';
  var FONT_STACK = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

  Lab.fitCanvas(canvas, 1.5);

  var glOpts = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  var gl = canvas.getContext('webgl2', glOpts);
  var isGL2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', glOpts) || canvas.getContext('experimental-webgl', glOpts);
  if (!gl) return;

  var linear = false;
  var texType = null;
  if (isGL2) {
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    texType = gl.HALF_FLOAT;
    linear = true;
  } else {
    var hf = gl.getExtension('OES_texture_half_float');
    if (hf) {
      texType = hf.HALF_FLOAT_OES;
      linear = !!gl.getExtension('OES_texture_half_float_linear');
    }
  }

  function canRender(internalFormat, format, type) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(f);
    gl.deleteTexture(t);
    return ok;
  }

  function pickFormat(list, type) {
    for (var i = 0; i < list.length; i++) {
      if (canRender(list[i][0], list[i][1], type)) return { internal: list[i][0], format: list[i][1], type: type };
    }
    return null;
  }

  var fmtRGBA, fmtRG, fmtR;
  if (isGL2) {
    fmtRGBA = pickFormat([[gl.RGBA16F, gl.RGBA]], texType);
    fmtRG = pickFormat([[gl.RG16F, gl.RG], [gl.RGBA16F, gl.RGBA]], texType);
    fmtR = pickFormat([[gl.R16F, gl.RED], [gl.RG16F, gl.RG], [gl.RGBA16F, gl.RGBA]], texType);
  } else {
    if (texType !== null) fmtRGBA = pickFormat([[gl.RGBA, gl.RGBA]], texType);
    if (!fmtRGBA) {
      var ff = gl.getExtension('OES_texture_float');
      if (ff) {
        fmtRGBA = pickFormat([[gl.RGBA, gl.RGBA]], gl.FLOAT);
        linear = !!gl.getExtension('OES_texture_float_linear');
      }
    }
    fmtRG = fmtR = fmtRGBA;
  }
  if (!fmtRGBA || !fmtRG || !fmtR) return;

  var VS = [
    'precision highp float;',
    'attribute vec2 aPosition;',
    'varying vec2 vUv;',
    'varying vec2 vL;',
    'varying vec2 vR;',
    'varying vec2 vT;',
    'varying vec2 vB;',
    'uniform vec2 texelSize;',
    'void main () {',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  vL = vUv - vec2(texelSize.x, 0.0);',
    '  vR = vUv + vec2(texelSize.x, 0.0);',
    '  vT = vUv + vec2(0.0, texelSize.y);',
    '  vB = vUv - vec2(0.0, texelSize.y);',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  var HEAD = 'precision highp float;\nprecision highp sampler2D;\nvarying vec2 vUv;\nvarying vec2 vL;\nvarying vec2 vR;\nvarying vec2 vT;\nvarying vec2 vB;\n';

  var FS = {
    copy: 'uniform sampler2D uTexture;\nvoid main () { gl_FragColor = texture2D(uTexture, vUv); }',
    scale: 'uniform sampler2D uTexture;\nuniform float value;\nvoid main () { gl_FragColor = value * texture2D(uTexture, vUv); }',
    splat: [
      'uniform sampler2D uTarget;',
      'uniform vec2 uScale;',
      'uniform vec2 point;',
      'uniform vec3 color;',
      'uniform float radius;',
      'void main () {',
      '  vec2 p = (vUv - point) * uScale;',
      '  vec3 s = exp(-dot(p, p) / radius) * color;',
      '  vec4 base = texture2D(uTarget, vUv);',
      '  gl_FragColor = vec4(base.xyz + s, base.a);',
      '}'
    ].join('\n'),
    ring: [
      'uniform sampler2D uTarget;',
      'uniform sampler2D uPaper;',
      'uniform vec2 uPaperScale;',
      'uniform vec2 uScale;',
      'uniform vec2 point;',
      'uniform vec3 color;',
      'uniform float ringR;',
      'uniform float ringW;',
      'void main () {',
      '  vec2 p = (vUv - point) * uScale;',
      '  float fib = texture2D(uPaper, vUv * uPaperScale).r - 0.5;',
      '  float a = atan(p.y, p.x);',
      '  float wob = 1.0 + 0.06 * sin(a * 7.0 + ringR * 40.0) + 0.04 * sin(a * 13.0 - ringR * 23.0);',
      '  float r = length(p) / wob;',
      '  float k = (r - ringR) / ringW;',
      '  float w = exp(-k * k) * (1.0 + fib * 0.9);',
      '  vec4 base = texture2D(uTarget, vUv);',
      '  gl_FragColor = vec4(base.xyz + color * max(w, 0.0), base.a);',
      '}'
    ].join('\n'),
    stamp: [
      'uniform sampler2D uTarget;',
      'uniform sampler2D uMask;',
      'uniform sampler2D uPaper;',
      'uniform vec2 uPaperScale;',
      'uniform float uFront;',
      'uniform float uAmount;',
      'void main () {',
      '  vec4 base = texture2D(uTarget, vUv);',
      '  vec4 m = texture2D(uMask, vUv);',
      '  float fib = texture2D(uPaper, vUv * uPaperScale).r - 0.5;',
      '  float grow = smoothstep(uFront - 0.14, uFront + 0.02, m.g + fib * 0.32);',
      '  float add = m.r * grow * uAmount * clamp(1.0 - base.r / 1.9, 0.0, 1.0);',
      '  float feather = smoothstep(0.04, 0.55, m.g) * (1.0 - m.r) * clamp(0.35 + fib * 3.2, 0.0, 1.0);',
      '  add += feather * grow * uAmount * 0.32 * clamp(1.0 - base.r / 0.45, 0.0, 1.0);',
      '  gl_FragColor = vec4(base.r + add, base.g, base.b, base.a);',
      '}'
    ].join('\n'),
    curl: [
      'uniform sampler2D uVelocity;',
      'void main () {',
      '  float L = texture2D(uVelocity, vL).y;',
      '  float R = texture2D(uVelocity, vR).y;',
      '  float T = texture2D(uVelocity, vT).x;',
      '  float B = texture2D(uVelocity, vB).x;',
      '  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);',
      '}'
    ].join('\n'),
    vorticity: [
      'uniform sampler2D uVelocity;',
      'uniform sampler2D uCurl;',
      'uniform float curl;',
      'uniform float dt;',
      'void main () {',
      '  float L = texture2D(uCurl, vL).x;',
      '  float R = texture2D(uCurl, vR).x;',
      '  float T = texture2D(uCurl, vT).x;',
      '  float B = texture2D(uCurl, vB).x;',
      '  float C = texture2D(uCurl, vUv).x;',
      '  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));',
      '  force /= length(force) + 0.0001;',
      '  force *= curl * C;',
      '  force.y *= -1.0;',
      '  vec2 v = texture2D(uVelocity, vUv).xy + force * dt;',
      '  v = clamp(v, vec2(-1000.0), vec2(1000.0));',
      '  gl_FragColor = vec4(v, 0.0, 1.0);',
      '}'
    ].join('\n'),
    divergence: [
      'uniform sampler2D uVelocity;',
      'void main () {',
      '  float L = texture2D(uVelocity, vL).x;',
      '  float R = texture2D(uVelocity, vR).x;',
      '  float T = texture2D(uVelocity, vT).y;',
      '  float B = texture2D(uVelocity, vB).y;',
      '  vec2 C = texture2D(uVelocity, vUv).xy;',
      '  if (vL.x < 0.0) { L = -C.x; }',
      '  if (vR.x > 1.0) { R = -C.x; }',
      '  if (vT.y > 1.0) { T = -C.y; }',
      '  if (vB.y < 0.0) { B = -C.y; }',
      '  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);',
      '}'
    ].join('\n'),
    pressure: [
      'uniform sampler2D uPressure;',
      'uniform sampler2D uDivergence;',
      'void main () {',
      '  float L = texture2D(uPressure, vL).x;',
      '  float R = texture2D(uPressure, vR).x;',
      '  float T = texture2D(uPressure, vT).x;',
      '  float B = texture2D(uPressure, vB).x;',
      '  float d = texture2D(uDivergence, vUv).x;',
      '  gl_FragColor = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);',
      '}'
    ].join('\n'),
    gradient: [
      'uniform sampler2D uPressure;',
      'uniform sampler2D uVelocity;',
      'void main () {',
      '  float L = texture2D(uPressure, vL).x;',
      '  float R = texture2D(uPressure, vR).x;',
      '  float T = texture2D(uPressure, vT).x;',
      '  float B = texture2D(uPressure, vB).x;',
      '  vec2 v = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);',
      '  gl_FragColor = vec4(v, 0.0, 1.0);',
      '}'
    ].join('\n'),
    advect: [
      'uniform sampler2D uVelocity;',
      'uniform sampler2D uSource;',
      'uniform vec2 texelSize;',
      'uniform vec2 srcTexel;',
      'uniform float dt;',
      'uniform float dissipation;',
      'vec4 bilerp (sampler2D sam, vec2 uv, vec2 ts) {',
      '  vec2 st = uv / ts - 0.5;',
      '  vec2 i = floor(st);',
      '  vec2 f = fract(st);',
      '  vec4 a = texture2D(sam, (i + vec2(0.5, 0.5)) * ts);',
      '  vec4 b = texture2D(sam, (i + vec2(1.5, 0.5)) * ts);',
      '  vec4 c = texture2D(sam, (i + vec2(0.5, 1.5)) * ts);',
      '  vec4 d = texture2D(sam, (i + vec2(1.5, 1.5)) * ts);',
      '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
      '}',
      'void main () {',
      '#ifdef MANUAL_FILTERING',
      '  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;',
      '  vec4 result = bilerp(uSource, coord, srcTexel);',
      '#else',
      '  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;',
      '  vec4 result = texture2D(uSource, coord);',
      '#endif',
      '  gl_FragColor = result / (1.0 + dissipation * dt);',
      '}'
    ].join('\n'),
    display: [
      'uniform sampler2D uDye;',
      'uniform sampler2D uPaper;',
      'uniform vec2 uPaperScale;',
      'uniform vec2 uTexel;',
      'float hash (vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'float vnoise (vec2 p) {',
      '  vec2 i = floor(p);',
      '  vec2 f = fract(p);',
      '  f = f * f * (3.0 - 2.0 * f);',
      '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);',
      '}',
      'void main () {',
      '  vec4 d = texture2D(uDye, vUv);',
      '  vec2 pu = vUv * uPaperScale;',
      '  float fib = texture2D(uPaper, pu).r - 0.5;',
      '  float cloud = vnoise(pu * 5.0) * 0.6 + vnoise(pu * 15.0) * 0.4 - 0.5;',
      '  float ink = max(d.r, 0.0);',
      '  float red = max(d.g, 0.0);',
      '  float dl = texture2D(uDye, vUv - vec2(uTexel.x, 0.0)).r;',
      '  float dr = texture2D(uDye, vUv + vec2(uTexel.x, 0.0)).r;',
      '  float db = texture2D(uDye, vUv - vec2(0.0, uTexel.y)).r;',
      '  float du = texture2D(uDye, vUv + vec2(0.0, uTexel.y)).r;',
      '  float edge = length(vec2(dr - dl, du - db));',
      '  float wash = smoothstep(0.0, 0.3, ink) * (1.0 - smoothstep(0.5, 2.0, ink));',
      '  ink *= 1.0 + fib * 1.5 * wash + cloud * 0.35 * wash;',
      '  ink += min(edge, 0.6) * 0.35;',
      '  float rw = smoothstep(0.0, 0.3, red) * (1.0 - smoothstep(0.5, 1.8, red));',
      '  red *= 1.0 + fib * 1.3 * rw + cloud * 0.3 * rw;',
      '  red = 1.08 * (1.0 - exp(-max(red, 0.0) * 1.3));',
      '  vec3 paper = vec3(0.945, 0.933, 0.906) + (fib * 0.055 + cloud * 0.02) * vec3(1.0, 1.0, 0.96);',
      '  vec3 inkCol = vec3(0.07, 0.077, 0.092);',
      '  vec3 T = exp(-max(ink, 0.0) * vec3(1.16, 1.08, 0.96));',
      '  vec3 col = mix(inkCol, paper, T);',
      '  col *= exp(-red * vec3(0.187, 1.463, 1.638));',
      '  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  };

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  var vertexShader = compile(gl.VERTEX_SHADER, VS);

  function makeProgram(body, defines) {
    var p = gl.createProgram();
    gl.attachShader(p, vertexShader);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, (defines || '') + HEAD + body));
    gl.bindAttribLocation(p, 0, 'aPosition');
    gl.linkProgram(p);
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { program: p, u: u };
  }

  var P = {};
  Object.keys(FS).forEach(function (k) {
    P[k] = makeProgram(FS[k], k === 'advect' && !linear ? '#define MANUAL_FILTERING\n' : '');
  });

  function use(prog) {
    gl.useProgram(prog.program);
    return prog.u;
  }

  function uf(loc) { return loc === undefined ? null : loc; }

  var quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  var idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target) {
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function makeFBO(w, h, fmt, filter) {
    gl.activeTexture(gl.TEXTURE0);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      tex: tex, fbo: fbo, width: w, height: h, tx: 1 / w, ty: 1 / h,
      attach: function (unit) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        return unit;
      },
      dispose: function () {
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(tex);
      }
    };
  }

  function makeDouble(w, h, fmt, filter) {
    var a = makeFBO(w, h, fmt, filter);
    var b = makeFBO(w, h, fmt, filter);
    return {
      width: w, height: h, tx: 1 / w, ty: 1 / h,
      get read() { return a; },
      get write() { return b; },
      swap: function () { var t = a; a = b; b = t; },
      dispose: function () { a.dispose(); b.dispose(); }
    };
  }

  function resizeDouble(old, w, h, fmt, filter) {
    if (old && old.width === w && old.height === h) return old;
    var next = makeDouble(w, h, fmt, filter);
    if (old) {
      var u = use(P.copy);
      gl.uniform1i(u.uTexture, old.read.attach(0));
      blit(next.read);
      old.dispose();
    }
    return next;
  }

  var SIM_RES = 128;
  var DYE_RES = touchFirst ? 560 : 1024;
  var quality = 1;
  var CURL_IDLE = 7;
  var CURL_STIR = 26;
  var energy = 0;
  var PRESSURE_KEEP = 0.8;
  var PRESSURE_ITER = 20;
  var VEL_DISS = 0.75;
  var DYE_DISS = 0.055;

  var dye, velocity, divergence, curlF, pressure;

  function gridSize(r) {
    var w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    var a = w > h ? w / h : h / w;
    var mn = Math.max(16, Math.round(r));
    var mx = Math.round(mn * a);
    return w > h ? { w: mx, h: mn } : { w: mn, h: mx };
  }

  function initFBOs() {
    var minSide = Math.min(gl.drawingBufferWidth, gl.drawingBufferHeight);
    var s = gridSize(SIM_RES * quality);
    var d = gridSize(Math.min(DYE_RES * quality, Math.max(256, minSide)));
    var filt = linear ? gl.LINEAR : gl.NEAREST;
    dye = resizeDouble(dye, d.w, d.h, fmtRGBA, filt);
    velocity = resizeDouble(velocity, s.w, s.h, fmtRG, filt);
    if (divergence) divergence.dispose();
    if (curlF) curlF.dispose();
    if (pressure) pressure.dispose();
    divergence = makeFBO(s.w, s.h, fmtR, gl.NEAREST);
    curlF = makeFBO(s.w, s.h, fmtR, gl.NEAREST);
    pressure = makeDouble(s.w, s.h, fmtR, gl.NEAREST);
  }

  function makePaperCanvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var x = c.getContext('2d');
    var img = x.createImageData(size, size);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = 128 + (Math.random() - 0.5) * 22;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.lineCap = 'round';
    var count = Math.round(size * size / 230);
    for (var k = 0; k < count; k++) {
      var sx = Math.random() * size, sy = Math.random() * size;
      var ang = Math.random() * Math.PI * 2;
      var len = 10 + Math.pow(Math.random(), 2.2) * 130;
      var bend = (Math.random() - 0.5) * len * 0.7;
      var ex = Math.cos(ang) * len, ey = Math.sin(ang) * len;
      var cx = ex * 0.5 - Math.sin(ang) * bend, cy = ey * 0.5 + Math.cos(ang) * bend;
      var light = Math.random() < 0.72;
      x.strokeStyle = light ? 'rgba(255,255,255,' + (0.1 + Math.random() * 0.28).toFixed(3) + ')' : 'rgba(0,0,0,' + (0.05 + Math.random() * 0.12).toFixed(3) + ')';
      x.lineWidth = 0.45 + Math.random() * 1.2;
      for (var ox = -1; ox <= 1; ox++) {
        for (var oy = -1; oy <= 1; oy++) {
          var bx = sx + ox * size, by = sy + oy * size;
          if (bx + 160 < 0 || bx - 160 > size || by + 160 < 0 || by - 160 > size) continue;
          x.beginPath();
          x.moveTo(bx, by);
          x.quadraticCurveTo(bx + cx, by + cy, bx + ex, by + ey);
          x.stroke();
        }
      }
    }
    return c;
  }

  var PAPER_SIZE = touchFirst ? 512 : 1024;
  var paperTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, paperTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makePaperCanvas(PAPER_SIZE));

  var maskTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  var maskBox = { x0: 0.3, x1: 0.7, y0: 0.4, y1: 0.6 };

  function bindTex(tex, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    return unit;
  }

  function buildMask() {
    var w = Math.max(64, Math.round(dye.width * 0.75));
    var h = Math.max(64, Math.round(dye.height * 0.75));
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, w, h);
    var portrait = h > w;
    var target = portrait ? 0.74 : 0.42;
    var fs = 100;
    x.font = '900 ' + fs + 'px ' + FONT_STACK;
    var mw = x.measureText(WORD).width || fs * 1.9;
    fs = Math.min(fs * (w * target) / mw, h * (portrait ? 0.3 : 0.4));
    x.font = '900 ' + fs + 'px ' + FONT_STACK;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    var cy = h * (portrait ? 0.47 : 0.5);
    x.fillStyle = 'rgb(255,0,0)';
    x.fillText(WORD, w / 2, cy);
    var k = Math.max(4, fs * 0.075);
    var sw = Math.max(8, Math.round(w / k)), sh = Math.max(8, Math.round(h / k));
    var sc = document.createElement('canvas');
    sc.width = sw;
    sc.height = sh;
    var sx = sc.getContext('2d');
    sx.fillStyle = '#000';
    sx.fillRect(0, 0, sw, sh);
    sx.font = '900 ' + (fs * sw / w) + 'px ' + FONT_STACK;
    sx.textAlign = 'center';
    sx.textBaseline = 'middle';
    sx.fillStyle = 'rgb(0,255,0)';
    sx.fillText(WORD, sw / 2, cy * sh / h);
    x.globalCompositeOperation = 'lighter';
    x.imageSmoothingEnabled = true;
    x.drawImage(sc, 0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
    var tw = Math.min(w, fs * 2.1);
    maskBox = { x0: 0.5 - tw / w / 2, x1: 0.5 + tw / w / 2, y0: 1 - (cy + fs * 0.55) / h, y1: 1 - (cy - fs * 0.55) / h };
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  function aspectScale() {
    var w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    return w > h ? [w / h, 1] : [1, h / w];
  }

  function paperScale() {
    return [canvas.clientWidth / PAPER_SIZE, canvas.clientHeight / PAPER_SIZE];
  }

  function splatVelocity(x, y, vx, vy, radius) {
    var u = use(P.splat);
    var s = aspectScale();
    gl.uniform1i(u.uTarget, velocity.read.attach(0));
    gl.uniform2f(u.uScale, s[0], s[1]);
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, vx, vy, 0);
    gl.uniform1f(u.radius, radius);
    blit(velocity.write);
    velocity.swap();
  }

  function splatDye(x, y, ink, red, radius) {
    var u = use(P.splat);
    var s = aspectScale();
    gl.uniform1i(u.uTarget, dye.read.attach(0));
    gl.uniform2f(u.uScale, s[0], s[1]);
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, ink, red, 0);
    gl.uniform1f(u.radius, radius);
    blit(dye.write);
    dye.swap();
  }

  function ringDye(x, y, ink, red, r, w) {
    var u = use(P.ring);
    var s = aspectScale();
    var ps = paperScale();
    gl.uniform1i(u.uTarget, dye.read.attach(0));
    gl.uniform1i(u.uPaper, bindTex(paperTex, 1));
    gl.uniform2f(u.uPaperScale, ps[0], ps[1]);
    gl.uniform2f(u.uScale, s[0], s[1]);
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, ink, red, 0);
    gl.uniform1f(u.ringR, r);
    gl.uniform1f(u.ringW, w);
    blit(dye.write);
    dye.swap();
  }

  function scaleDye(v) {
    var u = use(P.scale);
    gl.uniform1i(u.uTexture, dye.read.attach(0));
    gl.uniform1f(u.value, v);
    blit(dye.write);
    dye.swap();
  }

  function stamp(front, amount) {
    var u = use(P.stamp);
    var ps = paperScale();
    gl.uniform1i(u.uTarget, dye.read.attach(0));
    gl.uniform1i(u.uMask, bindTex(maskTex, 1));
    gl.uniform1i(u.uPaper, bindTex(paperTex, 2));
    gl.uniform2f(u.uPaperScale, ps[0], ps[1]);
    gl.uniform1f(u.uFront, front);
    gl.uniform1f(u.uAmount, amount);
    blit(dye.write);
    dye.swap();
  }

  function step(dt) {
    gl.disable(gl.BLEND);
    var u = use(P.curl);
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    blit(curlF);

    u = use(P.vorticity);
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(u.uCurl, curlF.attach(1));
    gl.uniform1f(u.curl, CURL_IDLE + (CURL_STIR - CURL_IDLE) * Math.min(1, energy));
    gl.uniform1f(u.dt, dt);
    blit(velocity.write);
    velocity.swap();

    u = use(P.divergence);
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    blit(divergence);

    u = use(P.scale);
    gl.uniform1i(u.uTexture, pressure.read.attach(0));
    gl.uniform1f(u.value, PRESSURE_KEEP);
    blit(pressure.write);
    pressure.swap();

    u = use(P.pressure);
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform1i(u.uDivergence, divergence.attach(0));
    for (var i = 0; i < PRESSURE_ITER; i++) {
      gl.uniform1i(u.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    u = use(P.gradient);
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform1i(u.uPressure, pressure.read.attach(0));
    gl.uniform1i(u.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    u = use(P.advect);
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty);
    gl.uniform2f(uf(u.srcTexel), velocity.tx, velocity.ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(u.uSource, 0);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.dissipation, VEL_DISS);
    blit(velocity.write);
    velocity.swap();

    gl.uniform2f(uf(u.srcTexel), dye.tx, dye.ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(u.uSource, dye.read.attach(1));
    gl.uniform1f(u.dissipation, DYE_DISS);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    var u = use(P.display);
    var ps = paperScale();
    gl.uniform2f(u.texelSize, dye.tx, dye.ty);
    gl.uniform1i(u.uDye, dye.read.attach(0));
    gl.uniform1i(u.uPaper, bindTex(paperTex, 1));
    gl.uniform2f(u.uPaperScale, ps[0], ps[1]);
    gl.uniform2f(u.uTexel, dye.tx * 1.5, dye.ty * 1.5);
    blit(null);
  }

  initFBOs();
  render();

  var clock = 0;
  var writing = -1;
  var fading = 0;
  var drops = [];
  var pointers = new Map();
  var ambientTimer = 0.3;
  var lastTap = { t: -10, x: 0, y: 0 };
  var tapCount = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function startWrite(fade) {
    buildMask();
    writing = 0;
    fading = fade ? 0.5 : 0;
    var n = reduced ? 4 : 11;
    for (var i = 0; i < n; i++) {
      var x = rand(maskBox.x0, maskBox.x1), y = rand(maskBox.y0, maskBox.y1);
      var a = Math.random() * Math.PI * 2, m = rand(6, 16);
      splatVelocity(x, y, Math.cos(a) * m, Math.sin(a) * m, rand(0.0015, 0.004));
    }
  }

  function minSidePx() {
    return Math.min(canvas.clientWidth, canvas.clientHeight) || 1;
  }

  function addDrop(x, y, red) {
    var size = red ? 0.45 : 1;
    drops.push({ x: x, y: y, age: 0, red: red, life: 1.15, size: size, held: null });
    var s = aspectScale();
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2 + rand(-0.3, 0.3);
      var r = 0.035 * size;
      var px = x + Math.cos(a) * r / s[0], py = y + Math.sin(a) * r / s[1];
      var m = rand(18, 40) * size * (Math.random() < 0.5 ? -1 : 1);
      splatVelocity(px, py, -Math.sin(a) * m, Math.cos(a) * m, 0.0006 * size);
    }
  }

  function toUv(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  }

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  canvas.addEventListener('pointerdown', function (e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var q = toUv(e);
    var p = pointers.get(e.pointerId);
    if (!p) {
      p = {};
      pointers.set(e.pointerId, p);
    }
    p.x = p.px = q.x;
    p.y = p.py = q.y;
    p.down = true;
    p.t0 = clock;
    p.cx = e.clientX;
    p.cy = e.clientY;
    p.travel = 0;
    p.red = false;
    p.hold = null;
    p.mouse = e.pointerType === 'mouse';
    p.finger = e.pointerType === 'touch';
    Lab.dismissHint();
  });

  canvas.addEventListener('pointermove', function (e) {
    var q = toUv(e);
    var p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType !== 'mouse') return;
      p = { x: q.x, y: q.y, px: q.x, py: q.y, down: false, mouse: true, travel: 0 };
      pointers.set(e.pointerId, p);
      return;
    }
    if (p.down) p.travel += Math.hypot(e.clientX - p.cx, e.clientY - p.cy);
    p.cx = e.clientX;
    p.cy = e.clientY;
    p.x = q.x;
    p.y = q.y;
  });

  function release(e) {
    var p = pointers.get(e.pointerId);
    if (!p) return;
    if (p.down && e.type === 'pointerup') {
      var dur = clock - p.t0;
      if (dur < 0.3 && p.travel < 12) {
        tapCount++;
        addDrop(p.x, p.y, tapCount % 4 === 0);
        var gap = clock - lastTap.t;
        var dpx = Math.hypot((p.x - lastTap.x) * canvas.clientWidth, (p.y - lastTap.y) * canvas.clientHeight);
        if (gap < 0.34 && dpx < 48) {
          startWrite(true);
          lastTap.t = -10;
        } else {
          lastTap = { t: clock, x: p.x, y: p.y };
        }
      }
    }
    if (p.hold) {
      p.hold.release = true;
    }
    if (p.mouse && e.type !== 'pointercancel') {
      p.down = false;
      p.hold = null;
    } else {
      pointers.delete(e.pointerId);
    }
  }

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', function (e) {
    var p = pointers.get(e.pointerId);
    if (p && !p.down) pointers.delete(e.pointerId);
  });

  rewriteBtn.addEventListener('click', function () {
    startWrite(true);
  });

  function applyPointers(dt) {
    var s = aspectScale();
    pointers.forEach(function (p) {
      var dx = p.x - p.px, dy = p.y - p.py;
      var dist = Math.hypot(dx * s[0], dy * s[1]);
      if (dist > 0.00005) {
        if (!p.down && dist > 0.3) {
          p.px = p.x;
          p.py = p.y;
          return;
        }
        var speed = Math.min(dist / Math.max(dt, 1 / 240), 4);
        var gain = p.down ? (p.finger ? 0.78 : 0.9) : 0.4;
        var vx = dx * velocity.width * 32 * gain;
        var vy = dy * velocity.height * 32 * gain;
        var vm = Math.hypot(vx, vy);
        var cap = 900;
        if (vm > cap) {
          vx *= cap / vm;
          vy *= cap / vm;
        }
        energy = Math.min(1.6, energy + speed * dt * (p.down ? 1.6 : 0.8));
        var steps = Math.min(12, Math.max(1, Math.ceil(dist / 0.012)));
        var stepLen = dist / steps;
        var fat = p.finger ? 1.35 : 1;
        var vScale = 1 / Math.sqrt(steps);
        var vRadius = (p.down ? 0.0022 : 0.0015) * fat;
        var inkK = p.down ? (16 + 3 * Math.min(speed, 2)) * (p.red ? 0.8 : 1) : 0;
        var inkRadius = (0.0008 + Math.min(speed, 2) * 0.0005) * fat;
        for (var i = 1; i <= steps; i++) {
          var t = i / steps;
          var x = p.px + dx * t, y = p.py + dy * t;
          splatVelocity(x, y, vx * vScale, vy * vScale, vRadius);
          if (inkK > 0) {
            var amt = inkK * stepLen;
            splatDye(x, y, p.red ? amt * 0.03 : amt, p.red ? amt * 0.85 : 0, inkRadius);
          }
        }
        p.px = p.x;
        p.py = p.y;
      }
      if (p.down) {
        var held = clock - p.t0;
        if (!p.hold && held > 0.32 && p.travel < 14) {
          p.hold = { x: p.x, y: p.y, age: 0, red: p.red, release: false };
          drops.push({ x: p.x, y: p.y, age: 0, red: p.red, life: 0, size: 1, held: p.hold });
        }
        if (p.hold && p.travel >= 14 + 30) p.hold.release = true;
      }
    });
  }

  function updateDrops(dt) {
    var s = aspectScale();
    for (var i = drops.length - 1; i >= 0; i--) {
      var d = drops[i];
      d.age += dt;
      if (d.held) {
        if (d.held.release) {
          drops.splice(i, 1);
          continue;
        }
        var R = 0.006 + 0.03 * Math.sqrt(d.age);
        var rate = 1.6 * dt;
        ringDye(d.x, d.y, d.red ? rate * 0.03 : rate, d.red ? rate * 0.9 : 0, R * 0.88, R * 0.3);
        splatDye(d.x, d.y, d.red ? rate * 0.03 : rate * 0.6, d.red ? rate * 0.7 : 0, 0.0004);
        if (!reduced) {
          var a = Math.random() * Math.PI * 2;
          var m = rand(10, 28);
          splatVelocity(d.x + Math.cos(a) * R / s[0], d.y + Math.sin(a) * R / s[1], Math.cos(a + 1.4) * m, Math.sin(a + 1.4) * m, 0.0005);
        }
        continue;
      }
      if (d.age > d.life) {
        drops.splice(i, 1);
        continue;
      }
      var k = d.age / d.life;
      var Rr = (0.008 + 0.06 * Math.sqrt(d.age)) * d.size;
      var amount = dt * 2.2 * (1 - k) * (1 - k) * d.size;
      var core = d.age < 0.12 ? dt * 9 * d.size : 0;
      var ink = d.red ? amount * 0.03 : amount;
      var red = d.red ? amount * 0.95 : 0;
      ringDye(d.x, d.y, ink, red, Rr, Rr * 0.22 + 0.004);
      if (core > 0) splatDye(d.x, d.y, d.red ? core * 0.03 : core, d.red ? core * 0.9 : 0, 0.00045 * d.size);
    }
  }

  function updateWriting(dt) {
    if (fading > 0) {
      fading -= dt;
      scaleDye(Math.max(0.0, 1 - 2.8 * dt));
    }
    if (writing < 0) return;
    writing += dt;
    var dur = 1.25;
    var front = 1.02 - (writing / dur) * 1.32;
    stamp(front, 3.4 * dt);
    if (writing > dur + 0.35) writing = -1;
  }

  function ambient(dt) {
    if (reduced) return;
    ambientTimer -= dt;
    if (ambientTimer > 0) return;
    ambientTimer = rand(0.35, 0.8);
    var a = Math.random() * Math.PI * 2;
    var m = rand(2, 5);
    splatVelocity(rand(0.05, 0.95), rand(0.05, 0.95), Math.cos(a) * m, Math.sin(a) * m, rand(0.012, 0.03));
  }

  var perf = { n: 0, sum: 0, done: false };
  function autoQuality(raw) {
    if (perf.done || clock < 0.8) return;
    perf.sum += raw;
    perf.n++;
    if (perf.n < 50) return;
    perf.done = true;
    var avg = perf.sum / perf.n;
    if (avg > 0.024) {
      quality = avg > 0.034 ? 0.55 : 0.75;
      PRESSURE_ITER = avg > 0.034 ? 12 : 16;
      initFBOs();
    }
  }

  var raf = 0;
  var last = 0;
  var started = false;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var raw = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    var dt = Math.min(Math.max(raw, 1 / 240), 1 / 30);
    if (Lab.fitCanvas(canvas, 1.5)) initFBOs();
    clock += dt;
    autoQuality(raw);
    energy *= Math.exp(-dt / 0.9);
    applyPointers(dt);
    updateDrops(dt);
    if (started) updateWriting(dt);
    ambient(dt);
    step(dt);
    render();
  }

  var fontTimeout = new Promise(function (r) { setTimeout(r, 1500); });
  var fontLoad = document.fonts && document.fonts.load ? document.fonts.load('900 100px "Pretendard Variable"', WORD).catch(function () {}) : Promise.resolve();
  Promise.race([fontLoad, fontTimeout]).then(function () {
    started = true;
    startWrite(false);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  });

  raf = requestAnimationFrame(frame);
})();
