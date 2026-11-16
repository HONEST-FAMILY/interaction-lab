import argparse
import base64
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

FFMPEG = os.environ.get("FFMPEG") or ("C:/Users/ssa41/bin/ffmpeg.exe" if os.path.exists("C:/Users/ssa41/bin/ffmpeg.exe") else "ffmpeg")
CHROME_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]
OUTSIDE = (-40.0, -40.0)

SHIM = r"""
(() => {
  if (window.__vt) return;
  const cfg = __CFG__;
  const W = window;
  const N = { raf: W.requestAnimationFrame.bind(W), st: W.setTimeout.bind(W), now: performance.now.bind(performance), Date: W.Date };
  const t0 = N.now(), e0 = N.Date.now();
  const V = { now: t0, t0, seq: 0, timers: new Map(), raf: new Map(), rid: 0, anims: new WeakMap(), native: N, lastPtr: null, ptrN: 0 };
  W.__vt = V;
  performance.now = () => V.now;
  const D = function (...a) {
    if (!new.target) return new N.Date(e0 + V.now - t0).toString();
    return a.length ? new N.Date(...a) : new N.Date(e0 + V.now - t0);
  };
  D.prototype = N.Date.prototype;
  D.now = () => Math.floor(e0 + V.now - t0);
  D.parse = N.Date.parse;
  D.UTC = N.Date.UTC;
  W.Date = D;
  const add = (fn, ms, args, rep) => {
    const id = ++V.seq;
    const f = typeof fn === 'function' ? fn : () => (0, eval)(String(fn));
    const d = Math.max(0, Number(ms) || 0);
    V.timers.set(id, { at: V.now + d, fn: f, args, every: rep ? Math.max(1, d) : 0, ord: id });
    return id;
  };
  W.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  W.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  W.clearTimeout = (id) => { V.timers.delete(id); };
  W.clearInterval = (id) => { V.timers.delete(id); };
  W.requestAnimationFrame = (cb) => { const id = ++V.rid; V.raf.set(id, cb); return id; };
  W.cancelAnimationFrame = (id) => { V.raf.delete(id); };
  if (W.requestIdleCallback) {
    W.requestIdleCallback = (cb) => add(() => cb({ didTimeout: false, timeRemaining: () => 8 }), 1, [], false);
    W.cancelIdleCallback = (id) => { V.timers.delete(id); };
  }
  if (cfg.seed !== null && cfg.seed !== undefined) {
    let s = cfg.seed >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  for (const ty of ['pointermove', 'pointerdown', 'pointerup', 'pointercancel']) {
    W.addEventListener(ty, (e) => { V.lastPtr = [ty.slice(7), Math.round(e.clientX * 100) / 100, Math.round(e.clientY * 100) / 100, e.pointerType, e.buttons]; V.ptrN++; }, { capture: true, passive: true });
  }
  V.stepAnims = (T) => {
    let n = 0;
    for (const a of document.getAnimations()) {
      if (a.timeline !== document.timeline) continue;
      if (a.playState === 'paused' || a.playState === 'idle') { V.anims.delete(a); continue; }
      const ct = typeof a.currentTime === 'number' ? a.currentTime : null;
      let r = V.anims.get(a);
      if (!r || (ct !== null && Math.abs(ct - r.last) > 0.5)) { r = { t: T, c: ct || 0, last: ct || 0 }; V.anims.set(a, r); }
      const c = r.c + (T - r.t) * (a.playbackRate || 1);
      try { a.currentTime = c; } catch (e) {}
      r.last = c;
      n++;
    }
    return n;
  };
  V.tick = (T) => {
    let nt = 0;
    for (;;) {
      let best = null, bid = 0;
      for (const [id, t] of V.timers) if (t.at <= T && (!best || t.at < best.at || (t.at === best.at && t.ord < best.ord))) { best = t; bid = id; }
      if (!best || nt > 4000) break;
      if (best.at > V.now) V.now = best.at;
      if (best.every) { best.at += best.every; best.ord = ++V.seq; } else V.timers.delete(bid);
      try { best.fn.apply(W, best.args || []); } catch (e) { console.error(e); }
      nt++;
    }
    V.now = T;
    const q = V.raf;
    V.raf = new Map();
    let nr = 0;
    for (const cb of q.values()) { try { cb(T); } catch (e) { console.error(e); } nr++; }
    return [nt, nr, V.stepAnims(T)];
  };
  V.ind = (o) => {
    let d = document.getElementById('__rec_ptr');
    if (!o || o.o <= 0) { if (d) d.style.opacity = '0'; return; }
    if (!d) { d = document.createElement('div'); d.id = '__rec_ptr'; d.style.cssText = cfg.indCss; document.documentElement.appendChild(d); }
    d.style.opacity = String(o.o);
    d.style.transform = 'translate3d(' + o.x + 'px,' + o.y + 'px,0) scale(' + o.s + ')';
  };
  V.nativeFrames = async (n) => {
    for (let i = 0; i < n; i++) await new Promise((r) => N.raf(r));
    if (n) await new Promise((r) => N.st(r, 0));
  };
  V.frame = async (f) => {
    if (f.y !== null && f.y !== undefined) { try { W.scrollTo({ left: 0, top: f.y, behavior: 'instant' }); } catch (e) { W.scrollTo(0, f.y); } }
    await V.nativeFrames(f.nf || 0);
    if (f.js) { try { (0, eval)(f.js); } catch (e) { console.error(e); } }
    const r = V.tick(f.T);
    V.ind(f.ind);
    let log = null;
    if (f.log) { try { log = (0, eval)(f.log); } catch (e) { log = 'ERR ' + e; } }
    const p = V.lastPtr;
    V.lastPtr = null;
    return { sy: W.scrollY, sx: W.scrollX, r, p, log };
  };
})();
"""

READY_JS = r"""
async (eager) => {
  const N = window.__vt.native;
  const guard = (p, ms) => Promise.race([p, new Promise((r) => N.st(r, ms))]);
  if (eager) document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
  const imgs = [...document.images];
  await guard(Promise.all(imgs.map((i) => i.complete ? null : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))), 20000);
  await guard(Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => null) : null))), 20000);
  await guard(document.fonts.ready, 20000);
  return { images: imgs.length, broken: imgs.filter((i) => !i.naturalWidth).map((i) => i.currentSrc || i.src), fonts: document.fonts.status, height: document.documentElement.scrollHeight };
}
"""


def ease(name, t):
    t = min(1.0, max(0.0, t))
    if name == "linear":
        return t
    if name == "smoothstep":
        return t * t * (3 - 2 * t)
    if name == "smootherstep":
        return t * t * t * (t * (6 * t - 15) + 10)
    if name == "sine":
        return 0.5 - 0.5 * math.cos(math.pi * t)
    if name == "cubic":
        return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2
    if name == "out":
        return 1 - (1 - t) ** 3
    if name == "in":
        return t * t * t
    if name.startswith("trap"):
        a = float(name.split(":")[1]) if ":" in name else 0.3
        a = min(0.5, max(0.01, a))
        vmax = 1.0 / (1.0 - a)

        def head(u):
            return vmax * (u / 2 - a / (2 * math.pi) * math.sin(math.pi * u / a))

        if t <= a:
            return head(t)
        if t >= 1 - a:
            return 1 - head(1 - t)
        return vmax * (a / 2 + (t - a))
    raise ValueError("unknown easing " + name)


def catmull(points, per=32):
    out = []
    n = len(points)
    for i in range(n - 1):
        p0, p1, p2, p3 = points[max(0, i - 1)], points[i], points[i + 1], points[min(n - 1, i + 2)]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3) for c in (0, 1)))
    out.append(tuple(points[-1]))
    return out


def along(poly, d):
    acc = 0.0
    for i in range(len(poly) - 1):
        seg = math.dist(poly[i], poly[i + 1])
        if acc + seg >= d or i == len(poly) - 2:
            u = 0.0 if seg == 0 else min(1.0, max(0.0, (d - acc) / seg))
            return (poly[i][0] + (poly[i + 1][0] - poly[i][0]) * u, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * u)
        acc += seg
    return tuple(poly[-1])


def png_size(data):
    return struct.unpack(">II", data[16:24])


class Recorder:
    def __init__(self, plan, out, limit=None, verbose=True):
        self.plan = plan
        self.out = Path(out)
        self.fps = float(plan.get("fps", 60))
        self.dt = 1000.0 / self.fps
        self.vw, self.vh = plan["viewport"]
        self.dpr = float(plan.get("dpr", 1))
        self.mobile = bool(plan.get("mobile", False))
        self.mode = plan.get("pointer", "touch" if self.mobile else "mouse")
        self.limit = limit
        self.verbose = verbose
        ind = plan.get("indicator", {})
        self.ind_size = float(ind.get("size", 28))
        self.ind_press = float(ind.get("pressed_scale", 0.82))
        self.ind_fade = max(1, round(float(ind.get("fade", 0.18)) * self.fps))
        self.ind_press_frames = max(1, round(float(ind.get("press_time", 0.08)) * self.fps))
        self.ind_css = ind.get("css") or (
            "position:fixed;left:0;top:0;width:{d}px;height:{d}px;margin:-{r}px 0 0 -{r}px;border-radius:50%;box-sizing:border-box;"
            "pointer-events:none;z-index:2147483647;opacity:0;background:rgba(255,255,255,.30);border:2px solid rgba(255,255,255,.92);"
            "box-shadow:0 2px 12px rgba(0,0,0,.30),0 0 0 1px rgba(0,0,0,.10);transition:none!important;animation:none!important;will-change:transform,opacity"
        ).format(d=self.ind_size, r=self.ind_size / 2)
        self.k = 0
        self.rec_i = 0
        self.y = 0.0
        self.px = None
        self.py = None
        self.down = False
        self.show = False
        self.o = 0.0
        self.pr = 0.0
        self.sent = {"x": None, "y": None, "down": False, "out": True}
        self.timeline = []
        self.segments = []
        self.marks = {}
        self.ptr_checks = [0, 0]
        self.t_base = None
        self.shot_scale = 1.0
        self.phase_ms = float(plan["phase_ms"]) if "phase_ms" in plan else 1000.0 / 120.0

    def say(self, msg):
        if self.verbose:
            print(msg, flush=True)

    def snap(self, y):
        mode = self.plan.get("snap", "auto")
        if mode == "css" or (mode == "auto" and self.mobile):
            return float(round(y))
        return round(y * self.dpr) / self.dpr

    def shim(self):
        cfg = {"seed": self.plan.get("seed", 1234), "indCss": self.ind_css}
        return SHIM.replace("__CFG__", json.dumps(cfg))

    def freeze(self):
        self.cdp.send("Animation.enable")
        self.cdp.send("Animation.setPlaybackRate", {"playbackRate": 0})

    def ready(self):
        page = self.page
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except Exception:
            self.say("networkidle timeout, continuing")
        css = "html{scroll-behavior:auto!important}*{caret-color:transparent!important}" + self.plan.get("hide_css", "")
        page.evaluate("(c) => { const s = document.createElement('style'); s.id = '__rec_css'; s.textContent = c; (document.head || document.documentElement).appendChild(s); }", css)
        info = page.evaluate(READY_JS, bool(self.plan.get("eager_images", True)))
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        info = page.evaluate(READY_JS, False)
        return info

    def prescroll(self):
        page = self.page
        h = page.evaluate("document.documentElement.scrollHeight")
        y = 0
        while y < h:
            page.evaluate("(y) => { window.scrollTo(0, y); return window.__vt.nativeFrames(2); }", y)
            time.sleep(0.12)
            y += int(self.vh * 0.75)
        page.evaluate("() => { window.scrollTo(0, document.documentElement.scrollHeight); return window.__vt.nativeFrames(2); }")
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        page.evaluate("() => { history.scrollRestoration = 'manual'; window.scrollTo(0, 0); return window.__vt.nativeFrames(2); }")
        page.reload(wait_until="load")
        self.freeze()

    def rect(self, sel):
        r = self.page.evaluate("(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, r.top + scrollY]; }", sel)
        if r is None:
            raise SystemExit("selector not found: " + sel)
        return r

    def point(self, p, space):
        if space and space != "viewport":
            r = self.rect(space)
            return (r[0] + p[0] * r[2], r[1] + p[1] * r[3])
        return (float(p[0]), float(p[1]))

    def max_scroll(self):
        return self.page.evaluate("Math.max(0, document.documentElement.scrollHeight - innerHeight)")

    def target_y(self, st):
        if "y" in st:
            y = float(st["y"])
        elif "selector" in st:
            r = self.rect(st["selector"])
            top = r[4]
            align = st.get("align", "top")
            if align == "center":
                y = top + r[3] / 2 - self.vh / 2
            elif align == "bottom":
                y = top + r[3] - self.vh
            else:
                y = top
            y += float(st.get("offset", 0))
        elif "dy" in st:
            y = self.y + float(st["dy"])
        else:
            raise SystemExit("scroll step needs y, selector or dy")
        return min(max(0.0, y), float(self.max_scroll()))

    def nframes(self, s):
        return max(1, int(round(float(s) * self.fps)))

    def gen(self, st):
        kind = st["do"]
        if kind == "warmup":
            for _ in range(self.nframes(st["s"])):
                yield {"record": False}
        elif kind == "hold":
            for _ in range(self.nframes(st["s"])):
                yield {}
        elif kind in ("scroll_to", "scroll_by"):
            y0 = self.y
            y1 = self.target_y(st)
            m = self.nframes(st["s"])
            e = st.get("easing", "smoothstep")
            for j in range(1, m + 1):
                yield {"y": y0 + (y1 - y0) * ease(e, j / m)}
        elif kind == "move":
            to = self.point(st["to"], st.get("space"))
            if "from" in st:
                p0 = self.point(st["from"], st.get("space"))
            elif self.px is not None and self.show:
                p0 = (self.px, self.py)
            else:
                p0 = to
            m = self.nframes(st["s"])
            e = st.get("easing", "sine")
            yield {"ptr": p0, "show": True}
            for j in range(1, m + 1):
                u = ease(e, j / m)
                yield {"ptr": (p0[0] + (to[0] - p0[0]) * u, p0[1] + (to[1] - p0[1]) * u), "show": True}
        elif kind == "down":
            yield {"down": True, "show": True}
        elif kind == "up":
            yield {"down": False}
        elif kind == "drag":
            pts = [self.point(p, st.get("space")) for p in st["path"]]
            m = self.nframes(st["s"])
            e = st.get("easing", "sine")
            timing = st.get("timing", "segments")
            press = st.get("press", True)
            release = st.get("release", True)
            yield {"ptr": pts[0], "show": True, "down": True if press else None}
            if timing == "arc":
                poly = catmull(pts) if st.get("spline", True) else pts
                total = sum(math.dist(poly[i], poly[i + 1]) for i in range(len(poly) - 1))
                for j in range(1, m + 1):
                    f = {"ptr": along(poly, total * ease(e, j / m)), "show": True}
                    if j == m and release:
                        f["down"] = False
                    yield f
            else:
                lens = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
                total = sum(lens) or 1.0
                bounds = [0.0]
                for L in lens:
                    bounds.append(bounds[-1] + L / total)
                for j in range(1, m + 1):
                    t = j / m
                    i = 0
                    while i < len(lens) - 1 and t > bounds[i + 1]:
                        i += 1
                    span = bounds[i + 1] - bounds[i]
                    u = 1.0 if span <= 0 else ease(e, (t - bounds[i]) / span)
                    p = (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u)
                    f = {"ptr": p, "show": True}
                    if j == m and release:
                        f["down"] = False
                    yield f
        elif kind == "leave":
            yield {"leave": True, "show": False}
            for _ in range(max(0, self.nframes(st.get("s", 0.2)) - 1)):
                yield {}
        elif kind == "hide":
            yield {"show": False}
            for _ in range(max(0, self.nframes(st.get("s", 0.2)) - 1)):
                yield {}
        elif kind == "tap":
            p = self.point(st["at"], st.get("space")) if "at" in st else None
            if p is None:
                r = self.rect(st["selector"])
                p = (r[0] + r[2] / 2, r[1] + r[3] / 2)
            yield {"ptr": p, "show": True}
            for _ in range(self.nframes(st.get("approach", 0.15))):
                yield {"ptr": p, "show": True}
            yield {"down": True, "show": True}
            for _ in range(self.nframes(st.get("press", 0.1))):
                yield {}
            yield {"down": False}
            for _ in range(self.nframes(st.get("after", 0.25))):
                yield {}
            if st.get("hide", True):
                yield {"show": False, "leave": self.mode == "mouse"}
                for _ in range(self.ind_fade):
                    yield {}
        elif kind == "eval":
            yield {"js": st["js"], "record": st.get("record", True)}
        else:
            raise SystemExit("unknown step " + kind)

    def dispatch(self, f):
        ev = []
        if f.get("leave") and self.mode == "mouse":
            if self.down:
                self.down = False
                ev.append(("up", self.px, self.py))
            ev.append(("leave",))
        if "ptr" in f and f["ptr"] is not None:
            self.px, self.py = round(f["ptr"][0], 2), round(f["ptr"][1], 2)
        want_down = f.get("down")
        if want_down is True and not self.down:
            if self.mode == "mouse" and (self.sent["x"], self.sent["y"]) != (self.px, self.py):
                ev.append(("move", self.px, self.py))
            ev.append(("down", self.px, self.py))
            self.down = True
        elif want_down is False and self.down:
            if (self.sent["x"], self.sent["y"]) != (self.px, self.py):
                ev.append(("move", self.px, self.py))
            ev.append(("up", self.px, self.py))
            self.down = False
        elif self.px is not None and not f.get("leave") and (self.sent["x"], self.sent["y"]) != (self.px, self.py):
            if self.mode == "mouse" and (self.show or f.get("show")):
                ev.append(("move", self.px, self.py))
            elif self.mode == "touch" and self.down:
                ev.append(("move", self.px, self.py))
        for e in ev:
            self.send(e)
        return ev

    def send(self, e):
        kind = e[0]
        if kind == "leave":
            self.cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": OUTSIDE[0], "y": OUTSIDE[1], "button": "none", "buttons": 0, "pointerType": "mouse"})
            self.sent.update({"x": None, "y": None, "down": False, "out": True})
            return
        x, y = e[1], e[2]
        if self.mode == "mouse":
            typ = {"move": "mouseMoved", "down": "mousePressed", "up": "mouseReleased"}[kind]
            held = (kind == "down") or (kind == "move" and self.sent["down"])
            payload = {"type": typ, "x": x, "y": y, "button": "left" if kind != "move" or held else "none", "buttons": 1 if held else 0, "pointerType": "mouse"}
            if kind != "move":
                payload["clickCount"] = 1
            self.cdp.send("Input.dispatchMouseEvent", payload)
        else:
            typ = {"move": "touchMove", "down": "touchStart", "up": "touchEnd"}[kind]
            pts = [] if kind == "up" else [{"x": x, "y": y, "id": 1, "radiusX": 8, "radiusY": 8, "force": 1}]
            self.cdp.send("Input.dispatchTouchEvent", {"type": typ, "touchPoints": pts})
        self.sent.update({"x": x, "y": y, "out": False})
        if kind == "down":
            self.sent["down"] = True
        elif kind == "up":
            self.sent["down"] = False

    def indicator(self, f):
        if "show" in f and f["show"] is not None:
            self.show = bool(f["show"])
        if self.mode == "touch":
            target = 1.0 if (self.show and self.down) else 0.0
        else:
            target = 1.0 if self.show else 0.0
        step = 1.0 / self.ind_fade
        self.o = min(target, self.o + step) if target > self.o else max(target, self.o - step)
        pt = 1.0 / self.ind_press_frames
        self.pr = min(1.0, self.pr + pt) if self.down else max(0.0, self.pr - pt)
        if self.o <= 0 or self.px is None:
            return None
        s = 1.0 - (1.0 - self.ind_press) * (0.5 - 0.5 * math.cos(math.pi * self.pr))
        s *= 0.9 + 0.1 * (0.5 - 0.5 * math.cos(math.pi * self.o))
        return {"x": self.px, "y": self.py, "o": round(0.5 - 0.5 * math.cos(math.pi * self.o), 4), "s": round(s, 4)}

    def frame(self, f, step_i):
        record = f.get("record", True)
        if "y" in f:
            self.y = self.snap(f["y"])
        ev = self.dispatch(f)
        ind = self.indicator(f)
        T = self.t_base + self.phase_ms + self.k * self.dt
        nf = 2 if record else (1 if self.k % 6 == 0 else 0)
        if ev and not record:
            nf = max(nf, 2)
        payload = {"y": self.y, "T": T, "nf": nf, "ind": ind, "js": f.get("js"), "log": self.plan.get("log_js") if record else None}
        res = self.page.evaluate("(f) => window.__vt.frame(f)", payload)
        entry = {"k": self.k, "T": round(T - self.t_base, 3), "y": self.y, "ya": res["sy"], "r": res["r"], "step": step_i}
        if self.px is not None:
            entry["ptr"] = [self.px, self.py, int(self.down)]
        if ind:
            entry["ind"] = ind["o"]
        if ev:
            entry["ev"] = [e[0] for e in ev]
            moved = [e for e in ev if e[0] in ("move", "down", "up")]
            if moved:
                self.ptr_checks[1] += 1
                p = res.get("p")
                if p and abs(p[1] - moved[-1][1]) < 0.6 and abs(p[2] - moved[-1][2]) < 0.6:
                    self.ptr_checks[0] += 1
                else:
                    entry["ptr_late"] = p
        if res.get("log") is not None:
            entry["log"] = res["log"]
        if record:
            data = self.capture(res)
            if self.rec_i == 0:
                exp = (round(self.vw * self.dpr), round(self.vh * self.dpr))
                w, h = png_size(data)
                if (w, h) != exp and w > 0:
                    self.shot_scale = exp[0] / w
                    data = self.capture(res)
                    w, h = png_size(data)
                self.size = (w, h)
                if (w, h) != exp:
                    raise SystemExit(f"screenshot size {w}x{h} != expected {exp}")
                self.say(f"capture {w}x{h} (clip scale {self.shot_scale:g})")
            (self.frames_dir / f"f_{self.rec_i:05d}.png").write_bytes(data)
            entry["i"] = self.rec_i
            self.rec_i += 1
        self.timeline.append(entry)
        self.k += 1

    def ready_js(self):
        js = self.plan.get("ready_js")
        if not js:
            return True
        end = time.time() + float(self.plan.get("ready_timeout", 20))
        while time.time() < end:
            try:
                if self.page.evaluate("(c) => { try { return !!(0, eval)(c); } catch (e) { return false; } }", js):
                    return True
            except Exception:
                pass
            time.sleep(0.25)
        return False

    def capture(self, res):
        shot = self.cdp.send("Page.captureScreenshot", {"format": "png", "optimizeForSpeed": True, "fromSurface": True, "captureBeyondViewport": False,
                                                        "clip": {"x": res["sx"], "y": res["sy"], "width": self.vw, "height": self.vh, "scale": self.shot_scale}})
        return base64.b64decode(shot["data"])

    def run(self):
        from playwright.sync_api import sync_playwright
        self.frames_dir = self.out / "frames"
        if self.frames_dir.exists():
            shutil.rmtree(self.frames_dir)
        self.frames_dir.mkdir(parents=True)
        t_start = time.time()
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome", headless=True, args=CHROME_ARGS)
            try:
                ctx = browser.new_context(
                    viewport={"width": self.vw, "height": self.vh}, device_scale_factor=self.dpr, is_mobile=self.mobile,
                    has_touch=self.mobile or self.mode == "touch", reduced_motion="no-preference", locale=self.plan.get("locale", "ko-KR"),
                )
                ctx.add_init_script(self.shim())
                self.page = ctx.new_page()
                self.cdp = ctx.new_cdp_session(self.page)
                self.freeze()
                self.page.goto(self.plan["url"], wait_until="load", timeout=60000)
                self.freeze()
                if self.plan.get("prescroll", True):
                    self.prescroll()
                tries = int(self.plan.get("load_retries", 4))
                for attempt in range(tries + 1):
                    info = self.ready()
                    self.freeze()
                    info["ready_js"] = self.ready_js()
                    self.say(f"ready (attempt {attempt + 1}) " + json.dumps(info, ensure_ascii=False))
                    if not info["broken"] and info["ready_js"]:
                        break
                    if attempt == tries:
                        raise SystemExit("page never became ready (broken images or ready_js false) - not recording a broken page")
                    time.sleep(4 * (attempt + 1))
                    self.page.evaluate("() => { history.scrollRestoration = 'manual'; window.scrollTo(0, 0); }")
                    self.page.reload(wait_until="load", timeout=60000)
                    self.freeze()
                frozen = self.page.evaluate("async () => { const a = document.timeline.currentTime; await window.__vt.nativeFrames(3); return [a, document.timeline.currentTime]; }")
                self.say(f"document.timeline frozen: {frozen[0] == frozen[1]} {frozen}")
                self.t_base = self.page.evaluate("window.__vt.t0")
                self.page.evaluate("() => window.scrollTo(0, 0)")
                if self.mode == "mouse":
                    self.send(("leave",))
                for si, st in enumerate(self.plan["steps"]):
                    if st["do"] == "mark":
                        self.marks[st["name"]] = self.rec_i
                        continue
                    i0 = self.rec_i
                    k0 = self.k
                    for f in self.gen(st):
                        self.frame(f, si)
                        if self.limit and self.rec_i >= self.limit:
                            break
                    self.segments.append({"step": si, "do": st["do"], "i0": i0, "i1": self.rec_i, "k0": k0, "k1": self.k, "label": st.get("label", "")})
                    self.say(f"step {si:2d} {st['do']:9s} {st.get('label', ''):14s} frames {i0}..{self.rec_i} y={self.y:.0f} t={time.time() - t_start:.0f}s")
                    if self.limit and self.rec_i >= self.limit:
                        break
            finally:
                browser.close()
        meta = {
            "plan": self.plan.get("name", ""), "url": self.plan["url"], "fps": self.fps, "viewport": [self.vw, self.vh], "dpr": self.dpr,
            "size": list(getattr(self, "size", (0, 0))), "mode": self.mode, "recorded": self.rec_i, "virtual_frames": self.k,
            "pointer_on_time": self.ptr_checks, "marks": self.marks, "segments": self.segments, "frames": self.timeline,
            "wall_seconds": round(time.time() - t_start, 1),
        }
        (self.out / "timeline.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        self.say(f"recorded {self.rec_i} frames ({self.rec_i / self.fps:.2f}s at {self.fps:g} fps) in {time.time() - t_start:.0f}s; pointer events on time {self.ptr_checks[0]}/{self.ptr_checks[1]}")
        return meta


def encode_preview(frames_dir, fps, out, crf=16):
    cmd = [FFMPEG, "-y", "-v", "error", "-framerate", f"{fps:g}", "-i", str(Path(frames_dir) / "f_%05d.png"),
           "-vf", "scale=flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p",
           "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-profile:v", "high",
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
           "-movflags", "+faststart", "-an", str(out)]
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser(description="Deterministic frame-stepped website interaction recorder")
    ap.add_argument("plan")
    ap.add_argument("--out", required=True)
    ap.add_argument("--mp4", help="also encode a high quality preview/master mp4 here")
    ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--limit", type=int, help="stop after N recorded frames (testing)")
    a = ap.parse_args()
    plan = json.loads(Path(a.plan).read_text(encoding="utf-8"))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    meta = Recorder(plan, out, limit=a.limit).run()
    if a.mp4:
        encode_preview(out / "frames", meta["fps"], a.mp4, a.crf)
        print("wrote", a.mp4, os.path.getsize(a.mp4), "bytes")


if __name__ == "__main__":
    main()
