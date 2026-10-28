(() => {
  const canvas = document.getElementById('c');
  const over = document.getElementById('o');
  const ctx = over.getContext('2d');
  const reduced = !!(window.Lab && Lab.reducedMotion);
  const touch = !!(window.Lab && Lab.isTouch);
  const LEVELS = 24;
  const METERS = 960;
  const MAXB = 32;
  const AMAX = 0.42;
  const ACC = '#e5482d';
  const NZ = Math.fround(0.142857142857);
  const NX = Math.fround(0.285714285714);
  const NY = Math.fround(-0.928571428571);

  const SNOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

  const BODY = `
uniform vec2 uRes;
uniform float uScale;
uniform float uTime;
uniform float uRise;
uniform float uReveal;
uniform float uDpr;
uniform float uOct;
uniform vec4 uB[${MAXB}];
${SNOISE}
float heightAt(vec2 p){
  vec3 q=vec3(p*1.25+vec2(3.7,1.3),uTime);
  float n=snoise(q)*0.56;
  n+=snoise(vec3(q.xy*2.07+vec2(5.2,9.1),q.z*1.3))*0.26;
  if(uOct>2.5) n+=snoise(vec3(q.xy*4.13+vec2(1.7,4.3),q.z*1.7))*0.12;
  float h=0.48+0.5*n*uRise;
  for(int i=0;i<${MAXB};i++){
    vec4 b=uB[i];
    vec2 d=p-b.xy;
    h+=b.w*exp(-dot(d,d)/(b.z*b.z));
  }
  return h;
}
void main(){
  vec2 fc=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  float h=heightAt(fc*uScale);
  float lv=h*${LEVELS.toFixed(1)};
  float fw=max(fwidth(lv),1e-5);
  float k=floor(lv+0.5);
  float d=abs(lv-k)/fw;
  float idx=1.0-step(0.5,mod(k,5.0));
  float w=mix(0.5,1.0,idx)*uDpr;
  float a=clamp(w+0.5-d,0.0,1.0);
  a*=mix(1.0-smoothstep(0.16,0.42,fw),1.0-smoothstep(0.3,0.7,fw),idx);
  float fade=mix(1.0,0.5,clamp(h,0.0,1.1));
  float alpha=a*mix(0.6,0.9,idx)*fade*clamp(uReveal-k,0.0,1.0);
  vec3 paper=vec3(0.945,0.933,0.906);
  vec3 ink=vec3(0.078);
  FRAG=vec4(mix(paper,ink,alpha),1.0);
}`;

  let gl = null;
  let gl2 = false;
  try {
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    gl2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false }) || canvas.getContext('experimental-webgl');
  } catch (_) {
    gl = null;
  }

  let prog = null;
  let U = {};
  const bumpData = new Float32Array(MAXB * 4);

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(log);
    }
    return s;
  }

  function setupGL() {
    if (!gl) return false;
    let vs, fs;
    if (gl2) {
      vs = '#version 300 es\nin vec2 aP;\nvoid main(){gl_Position=vec4(aP,0.0,1.0);}';
      fs = '#version 300 es\nprecision highp float;\nout vec4 fragOut;\n#define FRAG fragOut\n' + BODY;
    } else {
      if (!gl.getExtension('OES_standard_derivatives')) return false;
      vs = 'attribute vec2 aP;\nvoid main(){gl_Position=vec4(aP,0.0,1.0);}';
      fs = '#extension GL_OES_standard_derivatives : enable\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n#define FRAG gl_FragColor\n' + BODY;
    }
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(prog, 0, 'aP');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uRes', 'uScale', 'uTime', 'uRise', 'uReveal', 'uDpr', 'uOct']) U[n] = gl.getUniformLocation(prog, n);
    U.uB = gl.getUniformLocation(prog, 'uB[0]') || gl.getUniformLocation(prog, 'uB');
    return true;
  }

  let ok = false;
  try {
    ok = setupGL();
  } catch (_) {
    ok = false;
  }

  const mod289 = (x) => x - Math.floor(x * (1 / 289)) * 289;
  const permute = (x) => mod289((x * 34 + 1) * x);

  function corner(p, dx, dy, dz) {
    let m = 0.6 - (dx * dx + dy * dy + dz * dz);
    if (m <= 0) return 0;
    const j = p - 49 * Math.floor(p * NZ * NZ);
    const xq = Math.floor(j * NZ);
    const yq = Math.floor(j - 7 * xq);
    let gx = xq * NX + NY;
    let gy = yq * NX + NY;
    const gz = 1 - Math.abs(gx) - Math.abs(gy);
    if (gz <= 0) {
      gx -= Math.floor(gx) * 2 + 1;
      gy -= Math.floor(gy) * 2 + 1;
    }
    const nrm = 1.79284291400159 - 0.85373472095314 * (gx * gx + gy * gy + gz * gz);
    m *= m;
    return m * m * nrm * (gx * dx + gy * dy + gz * dz);
  }

  function snoise(vx, vy, vz) {
    const C0 = 1 / 6;
    const C1 = 1 / 3;
    const s = (vx + vy + vz) * C1;
    let ix = Math.floor(vx + s);
    let iy = Math.floor(vy + s);
    let iz = Math.floor(vz + s);
    const t = (ix + iy + iz) * C0;
    const x0 = vx - ix + t;
    const y0 = vy - iy + t;
    const z0 = vz - iz + t;
    const gx = x0 >= y0 ? 1 : 0;
    const gy = y0 >= z0 ? 1 : 0;
    const gz = z0 >= x0 ? 1 : 0;
    const lx = 1 - gx;
    const ly = 1 - gy;
    const lz = 1 - gz;
    const i1x = Math.min(gx, lz), i1y = Math.min(gy, lx), i1z = Math.min(gz, ly);
    const i2x = Math.max(gx, lz), i2y = Math.max(gy, lx), i2z = Math.max(gz, ly);
    ix = mod289(ix);
    iy = mod289(iy);
    iz = mod289(iz);
    const p0 = permute(permute(permute(iz) + iy) + ix);
    const p1 = permute(permute(permute(iz + i1z) + iy + i1y) + ix + i1x);
    const p2 = permute(permute(permute(iz + i2z) + iy + i2y) + ix + i2x);
    const p3 = permute(permute(permute(iz + 1) + iy + 1) + ix + 1);
    return 42 * (
      corner(p0, x0, y0, z0) +
      corner(p1, x0 - i1x + C0, y0 - i1y + C0, z0 - i1z + C0) +
      corner(p2, x0 - i2x + C1, y0 - i2y + C1, z0 - i2z + C1) +
      corner(p3, x0 - 0.5, y0 - 0.5, z0 - 0.5)
    );
  }

  let W = 1, H = 1, dpr = 1, odpr = 1, unit = 500, maxDpr = 1.5, oct = 3;
  let noiseT = 0, rise = 0.35, reveal = -1;
  let start = performance.now(), lastT = start, raf = 0;
  let perfN = 0, perfSum = 0, perfDone = false, fontReady = false;
  const bumps = [];
  const ptrs = new Map();
  const pins = [];
  let pinCount = 0;
  const cursor = { x: 0, y: 0, on: false, a: 0 };
  const labels = [];
  const SEEDS = [[0.2, 0.3], [0.44, 0.2], [0.72, 0.28], [0.86, 0.56], [0.6, 0.66], [0.32, 0.7], [0.12, 0.56], [0.5, 0.44]];
  for (let i = 0; i < SEEDS.length; i++) labels.push({ x: 0, y: 0, ang: 0, al: 0, text: '', ok: false, init: false });

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

  function heightAt(px, py) {
    const qx = px * 1.25 + 3.7;
    const qy = py * 1.25 + 1.3;
    const qz = noiseT;
    let n = snoise(qx, qy, qz) * 0.56;
    n += snoise(qx * 2.07 + 5.2, qy * 2.07 + 9.1, qz * 1.3) * 0.26;
    if (oct > 2.5) n += snoise(qx * 4.13 + 1.7, qy * 4.13 + 4.3, qz * 1.7) * 0.12;
    let h = 0.48 + 0.5 * n * rise;
    for (let i = 0; i < bumps.length; i++) {
      const b = bumps[i];
      const dx = px - b.x;
      const dy = py - b.y;
      h += b.a * Math.exp(-(dx * dx + dy * dy) / (b.r * b.r));
    }
    return h;
  }

  function layout() {
    Lab.fitCanvas(canvas, maxDpr);
    Lab.fitCanvas(over, 2);
    W = canvas.clientWidth || innerWidth;
    H = canvas.clientHeight || innerHeight;
    dpr = canvas.width / W;
    odpr = over.width / W;
    unit = clamp(Math.min(W, H) * 0.7, 300, 640);
    if (ok) gl.viewport(0, 0, canvas.width, canvas.height);
  }

  const toWorld = (x, y) => [x / unit, y / unit];
  const toLat = (y) => 37.965 - (y / H) * 0.17;
  const toLon = (x) => 127.6 + (x / W) * 0.26;
  const meters = (h) => Math.max(0, Math.round(h * METERS));

  function addBump(b) {
    if (bumps.length >= MAXB) {
      let worst = -1;
      let wv = 1e9;
      for (let i = 0; i < bumps.length; i++) {
        const c = bumps[i];
        if (c.held) continue;
        const v = Math.abs(c.a) + Math.abs(c.ta) + Math.abs(c.v) * 0.2;
        if (v < wv) {
          wv = v;
          worst = i;
        }
      }
      if (worst < 0) return null;
      bumps.splice(worst, 1);
    }
    bumps.push(b);
    return b;
  }

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const [x, y] = local(e);
    const [wx, wy] = toWorld(x, y);
    const r0 = (touch || e.pointerType === 'touch' ? 74 : 96) / unit;
    const b = addBump({ x: wx, y: wy, tx: wx, ty: wy, vx: 0, vy: 0, r: r0, r0, a: 0, v: 0, ta: 0, k: 34, c: 7.5, tau: 0, held: true });
    const now = performance.now();
    ptrs.set(e.pointerId, { b, x, y, lx: x, ly: y, lt: now, downT: now, moved: 0, speed: 0, sx: wx, sy: wy, type: e.pointerType });
    cursor.x = x;
    cursor.y = y;
    cursor.on = true;
  });

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    const p = ptrs.get(e.pointerId);
    if (e.pointerType === 'mouse' || p) {
      cursor.x = x;
      cursor.y = y;
      cursor.on = true;
    }
    if (!p) return;
    const now = performance.now();
    const dt = Math.max(4, now - p.lt) / 1000;
    const dist = Math.hypot(x - p.lx, y - p.ly);
    p.moved += dist;
    p.speed = p.speed * 0.55 + (dist / dt) * 0.45;
    p.lx = x;
    p.ly = y;
    p.lt = now;
    const b = p.b;
    if (!b) return;
    const [wx, wy] = toWorld(x, y);
    b.tx = wx;
    b.ty = wy;
    const dxs = b.x - p.sx;
    const dys = b.y - p.sy;
    const step = b.r * 0.42;
    if (dxs * dxs + dys * dys > step * step) {
      const fast = touch ? 650 : 900;
      if (p.speed > fast) {
        const depth = clamp((p.speed - fast) / 2600, 0.06, 0.26);
        addBump({ x: b.x, y: b.y, tx: 0, ty: 0, vx: 0, vy: 0, r: b.r0 * 0.62, r0: b.r0, a: 0, v: 0, ta: -depth, k: 26, c: 8, tau: 1.9, held: false });
      } else if (b.a > 0.04) {
        addBump({ x: b.x, y: b.y, tx: 0, ty: 0, vx: 0, vy: 0, r: b.r * 0.82, r0: b.r0, a: 0, v: 0, ta: b.a * 0.62, k: 22, c: 7, tau: 2.2, held: false });
      }
      p.sx = b.x;
      p.sy = b.y;
    }
  });

  function lift(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    const now = performance.now();
    if (p.b) {
      p.b.held = false;
      p.b.ta = 0;
      p.b.k = 2.4;
      p.b.c = 2.0;
      p.b.tau = 0;
    }
    if (e.type === 'pointerup' && now - p.downT < 280 && p.moved < 12) {
      const [wx, wy] = toWorld(p.x, p.y);
      pins.push({ x: wx, y: wy, sx: p.x, sy: p.y, n: ++pinCount, t: now, die: 0 });
      const alive = pins.filter((q) => !q.die);
      if (alive.length > 5) alive[0].die = now;
    }
    if (e.pointerType !== 'mouse' && ptrs.size === 0) cursor.on = false;
  }

  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !ptrs.has(e.pointerId)) cursor.on = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function updateBumps(dt, now) {
    for (let i = bumps.length - 1; i >= 0; i--) {
      const b = bumps[i];
      if (b.held) {
        let p = null;
        for (const q of ptrs.values()) if (q.b === b) p = q;
        const holdT = p ? (now - p.downT) / 1000 : 0;
        let target = AMAX * (1 - Math.exp(-holdT / 0.95));
        if (p) {
          const fast = touch ? 650 : 900;
          target *= 1 - clamp((p.speed - fast * 0.6) / (fast * 1.6), 0, 0.7);
        }
        b.ta = target;
        b.vx += (95 * (b.tx - b.x) - 17 * b.vx) * dt;
        b.vy += (95 * (b.ty - b.y) - 17 * b.vy) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.r = b.r0 * (0.8 + 0.55 * clamp(b.a / AMAX, 0, 1.2));
      } else if (b.tau > 0) {
        b.ta *= Math.exp(-dt / b.tau);
      }
      b.v += (b.k * (b.ta - b.a) - b.c * b.v) * dt;
      b.a += b.v * dt;
      if (!b.held && Math.abs(b.a) < 0.0012 && Math.abs(b.v) < 0.003 && Math.abs(b.ta) < 0.002) bumps.splice(i, 1);
    }
  }

  function render() {
    if (!ok) return;
    for (let i = 0; i < MAXB; i++) {
      const b = bumps[i];
      const o = i * 4;
      if (b) {
        bumpData[o] = b.x;
        bumpData[o + 1] = b.y;
        bumpData[o + 2] = b.r;
        bumpData[o + 3] = b.a;
      } else {
        bumpData[o] = -10;
        bumpData[o + 1] = -10;
        bumpData[o + 2] = 1;
        bumpData[o + 3] = 0;
      }
    }
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uScale, 1 / (unit * dpr));
    gl.uniform1f(U.uTime, noiseT);
    gl.uniform1f(U.uRise, rise);
    gl.uniform1f(U.uReveal, reveal);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uOct, oct);
    gl.uniform4fv(U.uB, bumpData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function gradAt(wx, wy) {
    const e = 1.5 / unit;
    const h = heightAt(wx, wy);
    const gx = (heightAt(wx + e, wy) - h) / e;
    const gy = (heightAt(wx, wy + e) - h) / e;
    return [h, gx, gy];
  }

  function updateLabels() {
    const placed = [];
    for (let i = 0; i < SEEDS.length; i++) {
      const L = labels[i];
      let wx = (SEEDS[i][0] * W) / unit;
      let wy = (SEEDS[i][1] * H) / unit;
      let [h, gx, gy] = gradAt(wx, wy);
      const target = (Math.round((h * LEVELS) / 5) * 5) / LEVELS;
      let good = true;
      for (let k = 0; k < 4; k++) {
        const g2 = gx * gx + gy * gy;
        if (g2 < 1e-4) {
          good = false;
          break;
        }
        const s = clamp((target - h) / g2, -0.4, 0.4);
        wx += gx * s;
        wy += gy * s;
        [h, gx, gy] = gradAt(wx, wy);
      }
      const x = wx * unit;
      const y = wy * unit;
      const gm = Math.hypot(gx, gy);
      const lvl = Math.round(target * LEVELS);
      if (Math.abs(h - target) * LEVELS > 0.15 || gm < 0.05 || lvl <= 0) good = false;
      if (x < 40 || x > W - 40 || y < 90 || y > H - 120) good = false;
      if (gm * LEVELS / unit > 0.18) good = false;
      for (const q of placed) if (Math.hypot(q[0] - x, q[1] - y) < 120) good = false;
      if (good) placed.push([x, y]);
      let ang = Math.atan2(gx, -gy);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      const text = String(lvl * (METERS / LEVELS));
      if (good && (!L.init || text !== L.text || Math.hypot(L.x - x, L.y - y) > 60)) {
        if (L.al < 0.05 || !L.init) {
          L.x = x;
          L.y = y;
          L.ang = ang;
          L.text = text;
          L.init = true;
        } else {
          good = false;
        }
      }
      if (good) {
        L.x += (x - L.x) * 0.35;
        L.y += (y - L.y) * 0.35;
        let da = ang - L.ang;
        if (da > Math.PI / 2) da -= Math.PI;
        if (da < -Math.PI / 2) da += Math.PI;
        L.ang += da * 0.35;
      }
      L.ok = good;
      L.al += ((good ? 1 : 0) - L.al) * 0.18;
    }
  }

  function drawOverlay(now, t) {
    ctx.setTransform(odpr, 0, 0, odpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const ui = reduced ? 1 : clamp((t - 0.9) / 0.7, 0, 1);
    ctx.globalAlpha = ui;
    ctx.strokeStyle = 'rgba(20,20,20,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const stepLon = 0.02;
    const stepLat = 0.02;
    for (let lon = Math.ceil(127.6 / stepLon) * stepLon; lon < 127.86; lon += stepLon) {
      const x = Math.round(((lon - 127.6) / 0.26) * W) + 0.5;
      for (let lat = Math.ceil((37.965 - 0.17) / stepLat) * stepLat; lat < 37.965; lat += stepLat) {
        const y = Math.round(((37.965 - lat) / 0.17) * H) + 0.5;
        if (y < 70 || y > H - 90) continue;
        ctx.moveTo(x - 4, y);
        ctx.lineTo(x + 4, y);
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, y + 4);
      }
    }
    ctx.stroke();
    if (fontReady) {
      ctx.font = '600 10px "Pretendard Variable", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const L of labels) {
        if (L.al < 0.02) continue;
        ctx.save();
        ctx.globalAlpha = ui * L.al;
        ctx.translate(L.x, L.y);
        ctx.rotate(L.ang);
        const w = ctx.measureText(L.text).width + 8;
        ctx.fillStyle = '#f1eee7';
        ctx.fillRect(-w / 2, -6.5, w, 13);
        ctx.fillStyle = 'rgba(20,20,20,0.78)';
        ctx.fillText(L.text, 0, 0.5);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    for (let i = pins.length - 1; i >= 0; i--) {
      const p = pins[i];
      const age = (now - p.t) / 1000;
      let al = clamp(age / 0.25, 0, 1);
      if (p.die) {
        al *= 1 - clamp((now - p.die) / 450, 0, 1);
        if (now - p.die > 450) {
          pins.splice(i, 1);
          continue;
        }
      }
      const x = p.sx;
      const y = p.sy;
      const h = heightAt(p.x, p.y);
      const flip = x > W - 190;
      const grow = easeOut(age / 0.45);
      const ex = x + (flip ? -26 : 26) * grow;
      const ey = y - 34 * grow;
      ctx.globalAlpha = al;
      if (age < 0.9) {
        const r = 4 + 22 * easeOut(age / 0.9);
        ctx.strokeStyle = `rgba(229,72,45,${0.7 * (1 - age / 0.9)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(20,20,20,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex + (flip ? -12 : 12) * grow, ey);
      ctx.stroke();
      ctx.fillStyle = ACC;
      ctx.beginPath();
      ctx.arc(x, y, 3.6, 0, Math.PI * 2);
      ctx.fill();
      if (fontReady && grow > 0.6) {
        ctx.globalAlpha = al * clamp((grow - 0.6) / 0.4, 0, 1);
        ctx.textBaseline = 'middle';
        ctx.textAlign = flip ? 'right' : 'left';
        const tx = ex + (flip ? -16 : 16);
        const num = String(p.n).padStart(2, '0');
        ctx.font = '700 12px "Pretendard Variable", sans-serif';
        ctx.fillStyle = ACC;
        const nw = ctx.measureText(num + '  ').width;
        const body = `해발 ${meters(h)}m`;
        ctx.font = '500 12px "Pretendard Variable", sans-serif';
        const bw = ctx.measureText(body).width;
        const left = flip ? tx - nw - bw : tx;
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(241,238,231,0.86)';
        ctx.fillRect(left - 4, ey - 9, nw + bw + 8, 18);
        ctx.font = '700 12px "Pretendard Variable", sans-serif';
        ctx.fillStyle = ACC;
        ctx.fillText(num, left, ey);
        ctx.font = '500 12px "Pretendard Variable", sans-serif';
        ctx.fillStyle = '#141414';
        ctx.fillText(body, left + nw, ey);
      }
      ctx.globalAlpha = 1;
    }
    cursor.a += ((cursor.on ? 1 : 0) - cursor.a) * 0.25;
    if (cursor.a > 0.02) {
      const x = Math.round(cursor.x) + 0.5;
      const y = Math.round(cursor.y) + 0.5;
      const gapR = 12;
      ctx.globalAlpha = cursor.a * ui;
      ctx.strokeStyle = 'rgba(20,20,20,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(x - gapR, y);
      ctx.moveTo(x + gapR, y);
      ctx.lineTo(W, y);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, y - gapR);
      ctx.moveTo(x, y + gapR);
      ctx.lineTo(x, H);
      ctx.stroke();
      if (fontReady) {
        const [wx, wy] = toWorld(cursor.x, cursor.y);
        const h = heightAt(wx, wy);
        const txt = `N ${toLat(cursor.y).toFixed(3)}°  E ${toLon(cursor.x).toFixed(3)}° · 해발 ${meters(h)}m`;
        ctx.font = '500 11px "Pretendard Variable", sans-serif';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(txt).width;
        const above = ptrs.size > 0 && touch;
        let tx = cursor.x + 16;
        let ty = cursor.y + (above ? -58 : 22);
        if (tx + tw > W - 12) tx = cursor.x - 16 - tw;
        if (tx < 8) tx = 8;
        if (ty < 76) ty = cursor.y + 26;
        if (ty > H - 70) ty = cursor.y - 26;
        ctx.fillStyle = 'rgba(241,238,231,0.88)';
        ctx.fillRect(tx - 5, ty - 9, tw + 10, 18);
        ctx.fillStyle = '#141414';
        ctx.textAlign = 'left';
        ctx.fillText(txt, tx, ty);
      }
      ctx.globalAlpha = 1;
    }
  }

  function perf(dt) {
    if (perfDone) return;
    perfN++;
    if (perfN > 20) perfSum += dt;
    if (perfN === 80) {
      perfDone = true;
      if (perfSum / 60 > 0.021) {
        maxDpr = 1;
        oct = 2;
        layout();
      }
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0) || dt > 0.1) dt = 1 / 60;
    const t = (now - start) / 1000;
    if (!reduced) noiseT += dt * 0.018;
    rise = reduced ? 1 : 0.35 + 0.65 * easeOut(t / 1.7);
    reveal = reduced ? 99 : -1 + (t / 1.4) * (LEVELS + 2);
    const sub = Math.min(dt, 1 / 30);
    updateBumps(sub, now);
    if (dt > sub) updateBumps(dt - sub, now);
    render();
    updateLabels();
    drawOverlay(now, t);
    perf(dt);
  }

  layout();
  window.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('600 12px "Pretendard Variable"', '해발m0123456789NE°.· ').then(() => { fontReady = true; }, () => { fontReady = true; });
    setTimeout(() => { fontReady = true; }, 1200);
  } else {
    fontReady = true;
  }
  raf = requestAnimationFrame(frame);
})();
