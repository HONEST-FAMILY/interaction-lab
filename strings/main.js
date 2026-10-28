(() => {
  const canvas = document.getElementById('c');
  const g = canvas.getContext('2d', { alpha: false });
  const btn = document.querySelector('.lab-btn');
  const reduced = !!(window.Lab && Lab.reducedMotion);
  const PAPER = '#f1eee7';
  const INK = [20, 20, 20];
  const ACC = [229, 72, 45];
  const FREQ = [116.54, 130.81, 155.56, 174.61, 207.65, 233.08, 261.63, 311.13, 349.23, 415.3, 466.16, 523.25];
  const NAME = ['임', '남', '황', '태', '중', '임', '남', '황', '태', '중', '임', '남'];
  const PREFIX = ['하배', '하배', '배', '배', '배', '배', '배', '', '', '', '', ''];
  const NOTE = ['B♭2', 'C3', 'E♭3', 'F3', 'A♭3', 'B♭3', 'C4', 'E♭4', 'F4', 'A♭4', 'B♭4', 'C5'];
  const S = 12;
  const R = 64;
  const strings = [];
  const pointers = new Map();
  const scratch = new Float32Array(1024);
  const queue = [];
  const voices = new Array(S).fill(null);
  const cache = [];
  const warm = [];
  let W = 1, H = 1, dpr = 1, portrait = false, maxDpr = 2, banded = true;
  let a0 = 0, a1 = 1, c0 = 0, c1 = 1, gap = 40, hookR = 16, maxD = 16, slipD = 20, pressD = 12;
  let fontReady = false;
  let start = performance.now(), lastT = start, lastInput = -1e9, nextBreeze = 6500, raf = 0;
  let introStep = 0, perfN = 0, perfSum = 0, perfDone = false;
  let actx = null, bus = null, master = null, soundOn = true;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeBack = (t) => {
    t = clamp(t, 0, 1);
    const k = 2.2;
    return 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);
  };
  const mixRGB = (t, a) => {
    const r = Math.round(INK[0] + (ACC[0] - INK[0]) * t);
    const gg = Math.round(INK[1] + (ACC[1] - INK[1]) * t);
    const b = Math.round(INK[2] + (ACC[2] - INK[2]) * t);
    return a === undefined ? `rgb(${r},${gg},${b})` : `rgba(${r},${gg},${b},${a})`;
  };
  const toScreen = (a, c) => (portrait ? [c, a] : [a, c]);

  function layout() {
    Lab.fitCanvas(canvas, maxDpr);
    W = canvas.clientWidth || innerWidth;
    H = canvas.clientHeight || innerHeight;
    dpr = canvas.width / W;
    portrait = H > W * 1.05;
    if (portrait) {
      a0 = Math.max(98, H * 0.12);
      a1 = H - Math.max(132, H * 0.16);
      const side = clamp(W * 0.075, 24, 96);
      c0 = side;
      c1 = W - side;
    } else {
      a0 = Math.max(104, W * 0.085);
      a1 = W - Math.max(124, W * 0.1);
      c0 = Math.max(100, H * 0.135);
      c1 = H - Math.max(134, H * 0.17);
    }
    gap = (c1 - c0) / (S - 1);
    hookR = Math.min(gap * 0.5, 34);
    maxD = gap * 0.42;
    slipD = gap * 0.58;
    pressD = gap * 0.3;
    for (let i = 0; i < S; i++) {
      const s = strings[i] || (strings[i] = { i, heat: 0, bend: 0, bendV: 0, bendT: 0, pinR: -1, pinL: -1, tR: 0, tL: 0, cR: 0, cL: 0, amp: 0, jit: 0, flash: -1e9 });
      s.c = c0 + gap * i;
      s.bx = a0 + (a1 - a0) * (0.2 + 0.22 * i / (S - 1));
      s.dR = (a1 - s.bx) / (R - 1);
      s.L = Math.max(5, Math.floor((s.bx - a0) / s.dR) + 1);
      s.dL = (s.bx - a0) / (s.L - 1);
      s.c2R = 0.88;
      s.c2L = 0.88 * Math.pow(s.dR / s.dL, 2);
      s.yR = new Float32Array(R);
      s.oR = new Float32Array(R);
      s.eR = new Float32Array(R);
      s.yL = new Float32Array(s.L);
      s.oL = new Float32Array(s.L);
      s.eL = new Float32Array(s.L);
      s.K = Math.round(11 + 10 * i / (S - 1));
      const T60 = 3.4 - 1.6 * i / (S - 1);
      s.keep = 1 - 13.8 / (60 * s.K * T60);
      s.pinR = -1;
      s.pinL = -1;
    }
    for (const p of pointers.values()) {
      p.mode = 'free';
      p.s = -1;
    }
  }

  function step(y, o, n, c2, keep, visc, pin, pinD) {
    const tmp = scratch;
    tmp[0] = 0;
    tmp[n - 1] = 0;
    for (let j = 1; j < n - 1; j++) {
      const yj = y[j];
      const vj = yj - o[j];
      const lap = y[j - 1] + y[j + 1] - 2 * yj;
      const lv = y[j - 1] - o[j - 1] + y[j + 1] - o[j + 1] - 2 * vj;
      tmp[j] = yj + vj * keep + c2 * lap + visc * lv;
    }
    if (pin > 0 && pin < n - 1) tmp[pin] = pinD;
    for (let j = 0; j < n; j++) {
      o[j] = y[j];
      y[j] = tmp[j];
    }
  }

  function simulate(frames) {
    for (const s of strings) {
      const steps = Math.max(1, Math.round(s.K * frames));
      const holdR = s.pinR > 0;
      const holdL = s.pinL > 0;
      const keepR = holdR ? s.keep - 0.07 : s.keep;
      const keepL = holdL ? s.keep - 0.07 : s.keep - 0.003;
      for (let k = 0; k < steps; k++) {
        if (holdR) s.cR += (s.tR - s.cR) * 0.18;
        if (holdL) s.cL += (s.tL - s.cL) * 0.18;
        step(s.yR, s.oR, R, s.c2R, keepR, 0.016, s.pinR, s.cR);
        step(s.yL, s.oL, s.L, s.c2L, keepL, 0.016, s.pinL, s.cL);
      }
      let amp = 0;
      for (let j = 0; j < R; j++) {
        const v = Math.abs(s.yR[j]);
        s.eR[j] = Math.max(v, s.eR[j] * 0.84);
        if (s.eR[j] > amp) amp = s.eR[j];
      }
      for (let j = 0; j < s.L; j++) {
        const v = Math.abs(s.yL[j]);
        s.eL[j] = Math.max(v, s.eL[j] * 0.84);
        if (s.eL[j] > amp) amp = s.eL[j];
      }
      s.amp = amp;
      s.jit = clamp((s.yR[1] + s.yL[s.L - 2]) * 0.55, -2.2, 2.2);
    }
  }

  function segInfo(s, seg) {
    return seg === 'R' ? [s.yR, s.oR, R] : [s.yL, s.oL, s.L];
  }

  function nodeAt(s, seg, a) {
    if (seg === 'R') return clamp(Math.round((a - s.bx) / s.dR), 1, R - 2);
    return clamp(Math.round((a - a0) / s.dL), 1, s.L - 2);
  }

  function pluckShape(s, seg, a, amp) {
    const [y, o, n] = segInfo(s, seg);
    const k = nodeAt(s, seg, a);
    for (let j = 1; j < n - 1; j++) {
      const tri = j <= k ? j / k : (n - 1 - j) / (n - 1 - k);
      const d = amp * tri;
      y[j] += d;
      o[j] += d;
    }
  }

  function kick(s, seg, A) {
    const [y, , n] = segInfo(s, seg);
    const c2 = seg === 'R' ? s.c2R : s.c2L;
    const w = (Math.PI * Math.sqrt(c2)) / (n - 1);
    for (let j = 1; j < n - 1; j++) y[j] += A * w * Math.sin((Math.PI * j) / (n - 1));
  }

  function later(ms, fn) {
    queue.push({ t: performance.now() + ms, fn });
  }

  function runQueue(now) {
    for (let k = queue.length - 1; k >= 0; k--) {
      if (queue[k].t <= now) {
        const q = queue[k];
        queue.splice(k, 1);
        q.fn();
      }
    }
  }

  function excite(i, seg, a, str, delay) {
    const s = strings[i];
    s.heat = Math.max(s.heat, 0.45 + 0.55 * str);
    s.flash = performance.now();
    const u = seg === 'R' ? (a - s.bx) / (a1 - s.bx) : (a - a0) / (s.bx - a0);
    const edge = 0.5 - Math.min(u, 1 - u);
    const bright = clamp(0.15 + 0.62 * str + edge * 0.45, 0, 1);
    const sx = portrait ? s.c : a;
    playNote(i, seg === 'L', str, bright, clamp((sx / W) * 2 - 1, -1, 1) * 0.7, delay);
    for (const j of [i - 5, i + 5]) {
      if (j < 0 || j >= S) continue;
      later(70, () => {
        const t = strings[j];
        kick(t, 'R', gap * 0.05 * str);
        t.heat = Math.max(t.heat, 0.16 * str);
      });
    }
  }

  function buildAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC({ latencyHint: 'interactive' });
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;
    master = actx.createGain();
    master.gain.value = soundOn ? 0.95 : 0;
    comp.connect(master);
    master.connect(actx.destination);
    const body = actx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 230;
    body.Q.value = 0.9;
    body.gain.value = 3;
    const air = actx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 5200;
    air.gain.value = -5;
    bus = actx.createGain();
    bus.connect(body);
    body.connect(air);
    const dry = actx.createGain();
    dry.gain.value = 0.92;
    air.connect(dry);
    dry.connect(comp);
    const verb = actx.createConvolver();
    verb.buffer = impulse(2.4);
    const wet = actx.createGain();
    wet.gain.value = 0.32;
    air.connect(verb);
    verb.connect(wet);
    wet.connect(comp);
    for (let i = 0; i < S; i++) warm.push([i, 1], [i, 0]);
  }

  function impulse(sec) {
    const sr = actx.sampleRate;
    const len = Math.floor(sr * sec);
    const pre = Math.floor(sr * 0.014);
    const b = actx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let n = pre; n < len; n++) {
        const x = (n - pre) / (len - pre);
        lp += (0.62 - 0.5 * x) * (Math.random() * 2 - 1 - lp);
        d[n] = lp * Math.pow(1 - x, 2.2) * Math.exp(-x * 3.2);
      }
    }
    return b;
  }

  function karplus(i, level) {
    const key = i * 2 + level;
    if (cache[key]) return cache[key];
    const sr = actx.sampleRate;
    const f = FREQ[i];
    const sw = level ? 0.3 : 0.5;
    const N = Math.max(4, Math.floor(sr / f + sw));
    const fAct = sr / (N - sw);
    const T60 = 4.4 - 2.3 * i / (S - 1);
    const len = Math.floor(sr * (0.9 + T60 * 0.62));
    const buffer = actx.createBuffer(1, len, sr);
    const out = buffer.getChannelData(0);
    const ex = new Float32Array(N);
    const dl = new Float32Array(N);
    const ca = level ? 0.9 : 0.24;
    let lp = 0;
    for (let k = 0; k < N; k++) {
      lp += ca * (Math.random() * 2 - 1 - lp);
      ex[k] = lp;
    }
    const pp = Math.max(1, Math.round(N * 0.12));
    let mean = 0;
    for (let k = 0; k < N; k++) {
      dl[k] = ex[k] - 0.82 * ex[(k + pp) % N];
      mean += dl[k];
    }
    mean /= N;
    let peak = 1e-6;
    for (let k = 0; k < N; k++) {
      dl[k] -= mean;
      peak = Math.max(peak, Math.abs(dl[k]));
    }
    for (let k = 0; k < N; k++) dl[k] /= peak;
    const rho = Math.pow(10, (-3 * (N - sw)) / (sr * T60));
    let idx = 0;
    for (let n = 0; n < len; n++) {
      const nx = idx + 1 === N ? 0 : idx + 1;
      const v = dl[idx];
      out[n] = v;
      dl[idx] = rho * ((1 - sw) * v + sw * dl[nx]);
      idx = nx;
    }
    const fl = Math.floor(len * 0.3);
    for (let n = 0; n < fl; n++) out[len - 1 - n] *= n / fl;
    const att = Math.floor(sr * 0.0015);
    for (let n = 0; n < att; n++) out[n] *= n / att;
    cache[key] = { buffer, rate: f / fAct };
    return cache[key];
  }

  function playNote(i, muted, str, bright, pan, delay) {
    if (!actx || !soundOn || actx.state !== 'running') return;
    const b = karplus(i, bright > 0.55 ? 1 : 0);
    const t = actx.currentTime + 0.004 + clamp(delay || 0, 0, 0.04);
    const s = strings[i];
    const r = b.rate * Math.pow(2, s.bend / 12);
    const src = actx.createBufferSource();
    src.buffer = b.buffer;
    src.playbackRate.setValueAtTime(r * Math.pow(2, (0.24 * str * str) / 12), t);
    src.playbackRate.setTargetAtTime(r, t + 0.004, 0.05);
    const lpf = actx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.Q.value = 0.4;
    lpf.frequency.value = Math.min(16000, FREQ[i] * (3 + 34 * bright * bright) * (muted ? 0.5 : 1));
    const gn = actx.createGain();
    gn.gain.setValueAtTime((muted ? 0.24 : 1) * 0.44 * Math.pow(str, 1.25), t);
    src.connect(lpf);
    lpf.connect(gn);
    if (actx.createStereoPanner) {
      const pn = actx.createStereoPanner();
      pn.pan.value = pan;
      gn.connect(pn);
      pn.connect(bus);
    } else {
      gn.connect(bus);
    }
    const old = voices[i];
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setTargetAtTime(0, t, 0.012);
      try { old.src.stop(t + 0.1); } catch (_) {}
    }
    src.start(t);
    const v = { src, gain: gn, rate: b.rate, sent: s.bend };
    voices[i] = v;
    src.onended = () => {
      if (voices[i] === v) voices[i] = null;
    };
  }

  function muteVoice(i) {
    const v = voices[i];
    if (!v || !actx) return;
    v.gain.gain.cancelScheduledValues(actx.currentTime);
    v.gain.gain.setTargetAtTime(0, actx.currentTime, 0.035);
  }

  function initAudio() {
    if (!soundOn) return;
    if (!actx) buildAudio();
    if (actx && actx.state === 'suspended') actx.resume();
  }

  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') initAudio(); }, true);
  window.addEventListener('pointerup', initAudio, true);
  window.addEventListener('touchend', initAudio, true);
  window.addEventListener('keydown', initAudio, true);

  btn.addEventListener('click', () => {
    soundOn = !soundOn;
    btn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    if (soundOn) initAudio();
    if (actx && master) master.gain.setTargetAtTime(soundOn ? 0.95 : 0, actx.currentTime, 0.04);
  });

  function loc(e) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return portrait ? [y, x, x, y] : [x, y, x, y];
  }

  function nearest(c) {
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < S; i++) {
      const d = Math.abs(c - strings[i].c);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return [best, bd];
  }

  function makePointer(e, a, c, x, y, down) {
    const now = performance.now();
    return { id: e.pointerId, a, c, pa: a, pc: c, x, y, t: now, down, downT: now, mode: 'free', s: -1, seg: 'R', hc: c, vc: 0, bend: 0, cool: new Float64Array(S) };
  }

  function startHook(p, i, ref) {
    const s = strings[i];
    p.mode = 'hook';
    p.s = i;
    p.hc = ref;
    p.seg = p.a < s.bx ? 'L' : 'R';
    const node = nodeAt(s, p.seg, p.a);
    if (p.seg === 'R') {
      s.pinR = node;
      s.cR = s.yR[node];
      s.tR = s.cR;
      muteVoice(i);
    } else {
      s.pinL = node;
      s.cL = s.yL[node];
      s.tL = s.cL;
    }
    s.heat = Math.max(s.heat, 0.3);
  }

  function updateHook(p, now) {
    const s = strings[p.s];
    const off = p.c - p.hc;
    if (Math.abs(off) > slipD) {
      releaseHook(p, now, true);
      return;
    }
    const d = maxD * Math.tanh(off / maxD);
    if (p.seg === 'R') {
      s.pinR = nodeAt(s, 'R', p.a);
      s.tR = d;
    } else {
      s.pinL = nodeAt(s, 'L', p.a);
      s.tL = d;
    }
    s.heat = Math.max(s.heat, 0.3 + 0.5 * Math.abs(d) / maxD);
  }

  function releaseHook(p, now, slipped) {
    const i = p.s;
    const s = strings[i];
    const seg = p.seg;
    const d = seg === 'R' ? s.cR : s.cL;
    if (seg === 'R') s.pinR = -1;
    else s.pinL = -1;
    let str = (Math.abs(d) / maxD) * 0.8;
    if (!slipped && str < 0.14 && now - p.downT < 360) {
      pluckShape(s, seg, p.a, maxD * 0.5 * (p.vc < 0 ? -1 : 1));
      str = 0.5;
    }
    excite(i, seg, p.a, clamp(str, 0.14, 1), 0);
    p.mode = 'free';
    p.cool[i] = now;
    p.s = -1;
  }

  function startPress(p, i) {
    const s = strings[i];
    p.mode = 'press';
    p.s = i;
    p.hc = p.c;
    p.bend = 0.45;
    p.pressT = performance.now();
    s.pinL = nodeAt(s, 'L', p.a);
    s.cL = s.yL[s.pinL];
    s.tL = s.cL;
  }

  function endPress(p) {
    const s = strings[p.s];
    if (s) s.pinL = -1;
    p.mode = 'free';
    p.bend = 0;
  }

  function updatePress(p, now) {
    const i = p.s;
    const s = strings[i];
    if (p.a > s.bx + 10) {
      endPress(p);
      startHook(p, i, p.c);
      return;
    }
    const off = p.c - p.hc;
    if (Math.abs(off) > slipD) {
      endPress(p);
      p.cool[i] = now;
      p.s = -1;
      return;
    }
    s.pinL = nodeAt(s, 'L', p.a);
    s.tL = pressD * Math.tanh(off / pressD);
    p.bend = 0.45 + 1.45 * Math.min(1, Math.abs(off) / pressD);
  }

  function scan(p, dt, now) {
    const speed = Math.abs(p.c - p.pc) / dt;
    for (let i = 0; i < S; i++) {
      const s = strings[i];
      const d0 = p.pc - s.c;
      const d1 = p.c - s.c;
      if (d0 === d1) continue;
      if (!((d0 < 0 && d1 >= 0) || (d0 > 0 && d1 <= 0))) continue;
      if (now - p.cool[i] < 140) continue;
      const f = d0 / (d0 - d1);
      const a = p.pa + (p.a - p.pa) * f;
      if (a < a0 || a > a1) continue;
      p.cool[i] = now;
      const seg = a < s.bx ? 'L' : 'R';
      if (p.down && speed < 0.32) {
        const keepA = p.a;
        p.a = a;
        startHook(p, i, s.c);
        p.a = keepA;
        return;
      }
      const dir = d1 > d0 ? 1 : -1;
      const str = clamp(0.3 + speed * 0.42, 0.3, 1) * (p.down ? 1 : 0.72);
      pluckShape(s, seg, a, dir * clamp(maxD * (0.22 + speed * 0.42), 2, maxD * 1.05));
      excite(i, seg, a, str, f * dt / 1000);
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const [a, c, x, y] = loc(e);
    const p = makePointer(e, a, c, x, y, true);
    pointers.set(e.pointerId, p);
    lastInput = p.t;
    const [i, d] = nearest(c);
    if (i >= 0 && d < hookR && a > a0 - 8 && a < a1 + 8) {
      if (a < strings[i].bx - 6) startPress(p, i);
      else startHook(p, i, c);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const [a, c, x, y] = loc(e);
    let p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') pointers.set(e.pointerId, makePointer(e, a, c, x, y, false));
      return;
    }
    const now = performance.now();
    const dt = Math.max(4, now - p.t);
    p.vc = p.vc * 0.4 + ((c - p.c) / dt) * 0.6;
    p.pa = p.a;
    p.pc = p.c;
    p.a = a;
    p.c = c;
    p.x = x;
    p.y = y;
    p.t = now;
    lastInput = now;
    if (p.mode === 'hook') updateHook(p, now);
    else if (p.mode === 'press') updatePress(p, now);
    if (p.mode === 'free') scan(p, dt, now);
  });

  function lift(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const now = performance.now();
    if (p.mode === 'hook') releaseHook(p, now, false);
    else if (p.mode === 'press') endPress(p);
    if (e.pointerType === 'mouse' && e.type === 'pointerup') {
      p.down = false;
      p.mode = 'free';
      p.s = -1;
    } else {
      pointers.delete(e.pointerId);
    }
  }

  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('pointerleave', (e) => {
    const p = pointers.get(e.pointerId);
    if (p && !p.down) pointers.delete(e.pointerId);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function updateBend(dt) {
    for (const s of strings) s.bendT = 0;
    for (const p of pointers.values()) {
      if (p.mode === 'press' && p.s >= 0) strings[p.s].bendT = Math.max(strings[p.s].bendT, p.bend);
    }
    const h = Math.min(dt, 1 / 30);
    for (let i = 0; i < S; i++) {
      const s = strings[i];
      s.bendV += ((s.bendT - s.bend) * 190 - s.bendV * 22) * h;
      s.bend += s.bendV * h;
      const v = voices[i];
      if (v && actx && Math.abs(s.bend - v.sent) > 0.004) {
        v.src.playbackRate.setTargetAtTime(v.rate * Math.pow(2, s.bend / 12), actx.currentTime, 0.012);
        v.sent = s.bend;
      }
    }
  }

  function intro(t) {
    if (reduced) {
      introStep = S;
      return;
    }
    while (introStep < S && t > 1.02 + introStep * 0.036) {
      const s = strings[introStep];
      pluckShape(s, 'R', s.bx + (a1 - s.bx) * 0.58, gap * 0.12);
      s.heat = Math.max(s.heat, 0.32);
      introStep++;
    }
  }

  function idle(now) {
    if (reduced || now - start < 4000) return;
    if (now - lastInput < 3500) {
      nextBreeze = Math.max(nextBreeze, now - start + 2500);
      return;
    }
    if (now - start > nextBreeze) {
      nextBreeze = now - start + 6000 + Math.random() * 3000;
      const sign = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < S; i++) {
        const k = sign > 0 ? i : S - 1 - i;
        later(k * 65, () => {
          kick(strings[i], 'R', 0.55);
          kick(strings[i], 'L', 0.25);
        });
      }
    }
  }

  function line(ax, ac, bx, bc) {
    const [x1, y1] = toScreen(ax, ac);
    const [x2, y2] = toScreen(bx, bc);
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
  }

  function trace(s, sign, env) {
    const yl = env ? s.eL : s.yL;
    const yr = env ? s.eR : s.yR;
    for (let j = 0; j < s.L; j++) {
      const [x, y] = toScreen(a0 + j * s.dL, s.c + sign * yl[j]);
      if (j === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    for (let j = 1; j < R; j++) {
      const [x, y] = toScreen(s.bx + j * s.dR, s.c + sign * yr[j]);
      g.lineTo(x, y);
    }
  }

  function traceBack(s) {
    for (let j = R - 1; j >= 1; j--) {
      const [x, y] = toScreen(s.bx + j * s.dR, s.c - s.eR[j]);
      g.lineTo(x, y);
    }
    for (let j = s.L - 1; j >= 0; j--) {
      const [x, y] = toScreen(a0 + j * s.dL, s.c - s.eL[j]);
      g.lineTo(x, y);
    }
  }

  function draw(now) {
    const t = reduced ? 9 : (now - start) / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    const fp = easeOut(t / 0.75);
    const mid = (c0 + c1) / 2;
    const ext = ((c1 - c0) / 2 + gap * 0.6) * fp;
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(20,20,20,0.26)';
    g.beginPath();
    line(a0, mid - ext, a0, mid + ext);
    line(a1, mid - ext, a1, mid + ext);
    line(a1 + 4, mid - ext, a1 + 4, mid + ext);
    g.stroke();
    const gp = easeOut((t - 0.5) / 0.9);
    if (gp > 0) {
      g.save();
      g.setLineDash([2, 4]);
      g.strokeStyle = `rgba(20,20,20,${0.16 * gp})`;
      g.beginPath();
      const f = strings[0];
      const l = strings[S - 1];
      const ex = gap * 0.6;
      const slope = (l.bx - f.bx) / (l.c - f.c);
      line(f.bx - slope * ex, f.c - ex, f.bx + (l.bx - f.bx) * gp + slope * ex * gp, f.c + (l.c - f.c) * gp + ex * gp);
      g.stroke();
      g.restore();
    }
    const total = a1 - a0;
    for (let i = 0; i < S; i++) {
      const s = strings[i];
      const st = t - (0.06 + 0.05 * i);
      const prog = easeOut(st / 0.62);
      if (prog <= 0) continue;
      const heat = clamp(s.heat, 0, 1);
      if (banded && s.amp > 0.9 && prog >= 1) {
        g.fillStyle = mixRGB(heat, 0.05 + 0.07 * heat);
        g.beginPath();
        trace(s, 1, true);
        traceBack(s);
        g.closePath();
        g.fill();
      }
      g.lineWidth = 1.7 - (0.75 * i) / (S - 1);
      g.strokeStyle = mixRGB(heat);
      if (prog < 1) g.setLineDash([total * prog, total * 3]);
      g.beginPath();
      if (s.amp < 0.06 && s.pinR < 0 && s.pinL < 0) line(a0, s.c, a1, s.c);
      else trace(s, 1, false);
      g.stroke();
      if (prog < 1) g.setLineDash([]);
      const bt = t - (0.3 + 0.05 * i);
      const bp = easeBack(bt / 0.46);
      if (bt > 0) {
        const bw = Math.min(7.5, gap * 0.22);
        const bh = Math.min(13, gap * 0.36);
        const drop = (1 - bp) * Math.max(16, gap * 0.55);
        const jit = s.jit;
        const [ax, ay] = toScreen(s.bx, s.c);
        const x = ax + (portrait ? jit * 0.5 : 0);
        const y = ay + (portrait ? 0 : jit * 0.5) - drop;
        g.globalAlpha = clamp(bt / 0.18, 0, 1);
        g.lineWidth = 1.25;
        g.strokeStyle = mixRGB(heat * 0.6);
        g.beginPath();
        g.moveTo(x - bw + jit * 0.15, y + bh);
        g.lineTo(x, y);
        g.lineTo(x + bw + jit * 0.15, y + bh);
        g.moveTo(x - bw - 2.5, y + bh);
        g.lineTo(x - bw + 1.5, y + bh);
        g.moveTo(x + bw - 1.5, y + bh);
        g.lineTo(x + bw + 2.5, y + bh);
        g.stroke();
        g.globalAlpha = 1;
      }
      if (fontReady) {
        const la = clamp(st / 0.4, 0, 1);
        g.globalAlpha = la;
        g.fillStyle = mixRGB(heat * 0.9, 0.5 + 0.5 * Math.max(heat, 0.5));
        g.textBaseline = 'middle';
        if (portrait) {
          g.textAlign = 'center';
          g.font = '600 13px "Pretendard Variable", sans-serif';
          g.fillText(NAME[i], s.c, a0 - 22);
          if (PREFIX[i]) {
            g.fillStyle = 'rgba(20,20,20,0.38)';
            g.font = '600 8px "Pretendard Variable", sans-serif';
            g.fillText(PREFIX[i] === '하배' ? '··' : '·', s.c, a0 - 36);
          }
          g.fillStyle = mixRGB(heat, 0.34 + 0.66 * heat);
          g.font = '500 10px "Pretendard Variable", sans-serif';
          g.fillText(String(i + 1), s.c, a1 + 18);
        } else {
          g.textAlign = 'right';
          g.font = '600 14px "Pretendard Variable", sans-serif';
          g.fillText(NAME[i], a0 - 18, s.c);
          if (PREFIX[i]) {
            g.fillStyle = 'rgba(20,20,20,0.4)';
            g.font = '500 10px "Pretendard Variable", sans-serif';
            g.fillText(PREFIX[i], a0 - 38, s.c + 1);
          }
          g.textAlign = 'left';
          g.font = '500 11px "Pretendard Variable", sans-serif';
          g.fillStyle = 'rgba(20,20,20,0.34)';
          g.fillText(String(i + 1).padStart(2, '0'), a1 + 16, s.c);
          if (heat > 0.04) {
            g.fillStyle = mixRGB(1, heat);
            g.fillText(`${NOTE[i]}  ${FREQ[i].toFixed(1)}Hz`, a1 + 38, s.c);
          }
        }
        g.globalAlpha = 1;
      }
    }
    if (fontReady && !portrait) {
      const da = clamp((t - 1.3) / 0.6, 0, 1);
      if (da > 0) {
        const f = strings[0];
        g.globalAlpha = da;
        g.strokeStyle = 'rgba(20,20,20,0.3)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(f.bx, f.c - 12);
        g.lineTo(f.bx, f.c - 34);
        g.moveTo(a0 + 2, f.c - 34);
        g.lineTo(f.bx - 8, f.c - 34);
        g.moveTo(a1 + 2, f.c - 12);
        g.lineTo(a1 + 2, f.c - 34);
        g.stroke();
        g.fillStyle = 'rgba(20,20,20,0.5)';
        g.font = '500 11px "Pretendard Variable", sans-serif';
        g.textBaseline = 'bottom';
        g.textAlign = 'center';
        g.fillText('안족', f.bx, f.c - 38);
        g.fillText('현침', a1 + 2, f.c - 38);
        g.textAlign = 'left';
        g.fillText('농현 · 누르면 음이 올라갑니다', a0 + 2, f.c - 38);
        g.globalAlpha = 1;
      }
    }
    if (fontReady) {
      for (const p of pointers.values()) {
        if (p.mode !== 'press' || p.s < 0) continue;
        const s = strings[p.s];
        const [px, py] = toScreen(p.a, s.c + s.cL);
        const lx = px + 22;
        const ly = py - 40;
        g.strokeStyle = 'rgba(20,20,20,0.55)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(lx, ly);
        g.lineTo(lx + 10, ly);
        g.stroke();
        g.fillStyle = ACC_CSS;
        g.beginPath();
        g.arc(px, py, 3.2, 0, Math.PI * 2);
        g.fill();
        g.font = '600 12px "Pretendard Variable", sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillStyle = '#141414';
        g.fillText('농현', lx + 14, ly);
        g.fillStyle = ACC_CSS;
        g.fillText(`+${Math.round(s.bend * 100)}¢`, lx + 44, ly);
      }
    }
  }

  const ACC_CSS = `rgb(${ACC[0]},${ACC[1]},${ACC[2]})`;

  function decay(dt) {
    const k = Math.exp(-dt / 0.62);
    for (const s of strings) s.heat *= k;
  }

  function perf(dt) {
    if (perfDone) return;
    perfN++;
    if (perfN > 30) perfSum += dt;
    if (perfN === 90) {
      perfDone = true;
      if (perfSum / 60 > 0.024) {
        maxDpr = 1.25;
        banded = false;
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
    intro(t);
    idle(now);
    runQueue(now);
    updateBend(dt);
    simulate(clamp(dt * 60, 0.5, 2));
    decay(dt);
    if (warm.length && actx) {
      const [i, l] = warm.shift();
      karplus(i, l);
    }
    draw(now);
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
    document.fonts.load('600 14px "Pretendard Variable"', '황태중임남하배안족현침농누른채다손으로튕기면음이올라갑니다0123456789¢HzBCEFA♭').then(() => { fontReady = true; }, () => { fontReady = true; });
    setTimeout(() => { fontReady = true; }, 1200);
  } else {
    fontReady = true;
  }
  raf = requestAnimationFrame(frame);
})();
