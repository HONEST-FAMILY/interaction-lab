import sys, asyncio, json, pathlib
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw

URL = sys.argv[1]
OUT = pathlib.Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
PERF_ONLY = "--perf-only" in sys.argv[3:]
UA_M = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36"

MARK_JS = """() => {
  const vh = innerHeight;
  const all = [...document.querySelectorAll('section, footer')].filter(s => !s.parentElement.closest('section, footer'));
  const out = [];
  all.forEach((s, i) => {
    const r = s.getBoundingClientRect();
    const top = r.top + scrollY;
    if (r.height < 120 || top < vh * 0.6) return;
    s.setAttribute('data-mc', String(out.length));
    out.push({idx: out.length, id: s.id || '', cls: (s.className || '').toString().slice(0, 40), top: Math.round(top), h: Math.round(r.height)});
  });
  return out;
}"""

SIG_JS = """(idx) => {
  const s = document.querySelector('[data-mc="' + idx + '"]');
  if (!s) return {};
  const els = [s, ...s.querySelectorAll('*')].slice(0, 600);
  const sig = {};
  const nums = {};
  let hidden = 0;
  els.forEach((e, i) => {
    const cs = getComputedStyle(e);
    const k = [cs.opacity, cs.transform, cs.clipPath, cs.filter, cs.visibility, cs.strokeDashoffset].join('|');
    sig[i] = k;
    if (!e.children.length && /\\d/.test(e.textContent || '')) nums[i] = [(e.textContent || '').trim().slice(0, 20), (e.parentElement ? e.parentElement.textContent : '').trim().slice(0, 40)];
    if ((+cs.opacity < 0.05 || cs.visibility === 'hidden') && (e.innerText || e.tagName === 'IMG')) hidden++;
  });
  return {sig, nums, hidden};
}"""

CHEAP_JS = """(i) => {
  const e = document.querySelector('[data-mh="' + i + '"]');
  if (!e) return {};
  const list = [e, ...e.querySelectorAll('*')].slice(0, 12);
  if (e.parentElement) list.push(e.parentElement);
  const tilt = list.some(x => getComputedStyle(x).transform.startsWith('matrix3d('));
  const r = e.getBoundingClientRect();
  return {tilt, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height};
}"""

PERF_START_JS = """() => {
  window.__ft = []; window.__lt = 0; window.__ftStop = false;
  let last = performance.now();
  const tick = (t) => { window.__ft.push(t - last); last = t; if (!window.__ftStop) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => { for (const x of l.getEntries()) window.__lt += x.duration; }).observe({type: 'longtask'}); } catch (err) {}
}"""

PERF_STOP_JS = """() => {
  window.__ftStop = true;
  const f = window.__ft.slice(2).sort((a, b) => a - b);
  const q = (p) => f.length ? f[Math.min(f.length - 1, Math.floor(f.length * p))] : 0;
  return {frames: f.length, median: q(0.5), p95: q(0.95), over50: f.filter(x => x > 50).length / Math.max(1, f.length), longtask_ms: Math.round(window.__lt)};
}"""

HOVER_CANDS_JS = """(idx) => {
  document.querySelectorAll('[data-mh]').forEach(x => x.removeAttribute('data-mh'));
  const s = document.querySelector('[data-mc="' + idx + '"]');
  if (!s) return [];
  const sel = 'a, button, [role=tab], input, select, textarea, [data-tilt], figure, img, li, article';
  const out = [];
  const seen = new Set();
  for (const e of s.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect();
    if (r.width < 24 || r.height < 18) continue;
    const cy = Math.max(r.top, 80) / 2 + Math.min(r.bottom, innerHeight - 20) / 2;
    if (Math.min(r.bottom, innerHeight - 20) - Math.max(r.top, 80) < 16 || r.left < 0 || r.right > innerWidth) continue;
    const key = Math.round(r.left / 20) + ':' + Math.round(r.top / 20);
    if (seen.has(key)) continue;
    seen.add(key);
    e.setAttribute('data-mh', String(out.length));
    out.push({i: out.length, tag: e.tagName, x: r.left + r.width / 2, y: cy, txt: (e.innerText || e.getAttribute('alt') || '').trim().slice(0, 14)});
    if (out.length >= 10) break;
  }
  return out;
}"""

HSIG_JS = """(i) => {
  const e = document.querySelector('[data-mh="' + i + '"]');
  if (!e) return '';
  const list = [e, ...e.querySelectorAll('*')].slice(0, 12);
  if (e.parentElement) list.push(e.parentElement);
  const parts = [];
  for (const x of list) {
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(x, pseudo);
      parts.push([cs.transform, cs.boxShadow, cs.backgroundColor, cs.color, cs.borderColor, cs.textDecorationColor, cs.textDecorationLine, cs.filter, cs.opacity, cs.clipPath, cs.width, cs.backgroundSize].join('|'));
    }
  }
  return parts.join('#');
}"""

HIDDEN_IN_VIEW_JS = """() => {
  let n = 0; const names = [];
  for (const e of document.querySelectorAll('h1,h2,h3,h4,p,li,img,a,button,dt,dd,figure')) {
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) continue;
    if (e.closest('[hidden], dialog:not([open]), [aria-hidden=true], [aria-live], [role=status], [data-mc-skip]')) continue;
    let fixed = false, a = e;
    while (a && a !== document.body) { if (getComputedStyle(a).position === 'fixed') { fixed = true; break; } a = a.parentElement; }
    if (fixed) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let op = 1, x = e;
    while (x && x !== document.body) { op *= +getComputedStyle(x).opacity; x = x.parentElement; }
    if (op < 0.15) { n++; if (names.length < 6) names.push((e.innerText || e.getAttribute('alt') || e.tagName).trim().slice(0, 16)); }
  }
  return {n, names};
}"""


async def entering(b, w, h, mobile, tag, rep, frames):
    ctx = await b.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, user_agent=UA_M if mobile else None, locale="ko-KR")
    p = await ctx.new_page()
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)[:140]))
    p.on("console", lambda m: errs.append(m.text[:140]) if m.type == "error" else None)
    await p.goto(URL, wait_until="load")
    await p.wait_for_timeout(1800)
    secs = await p.evaluate(MARK_JS)
    before = {}
    for s in secs:
        before[s["idx"]] = await p.evaluate(SIG_JS, s["idx"])
    res = []
    for s in secs:
        y = max(0, s["top"] - int(h * 0.25))
        await p.evaluate(f"window.scrollTo({{top:{y}, behavior:'instant'}})")
        await p.wait_for_timeout(260)
        fm = OUT / f"{tag}_s{s['idx']}_a.png"
        await p.screenshot(path=str(fm))
        await p.wait_for_timeout(1300)
        ff = OUT / f"{tag}_s{s['idx']}_b.png"
        await p.screenshot(path=str(ff))
        frames.append((tag, s["idx"], fm, ff))
        after = await p.evaluate(SIG_JS, s["idx"])
        bs, as_ = before[s["idx"]].get("sig", {}), after.get("sig", {})
        changed = sum(1 for k in as_ if bs.get(k) != as_[k])
        bn, an = before[s["idx"]].get("nums", {}), after.get("nums", {})
        rolled = [an[k][1] or an[k][0] for k in an if k in bn and bn[k][0] != an[k][0]]
        item = {**s, "changed": changed, "hidden_before": before[s["idx"]].get("hidden", 0), "hidden_after": after.get("hidden", 0), "rolled_numbers": rolled[:6]}
        if not mobile:
            cands = await p.evaluate(HOVER_CANDS_JS, s["idx"])
            hc = 0
            names = []
            tilt = []
            magnet = []
            for c in cands:
                c0 = await p.evaluate(CHEAP_JS, c["i"])
                if c["tag"] in ("A", "BUTTON") and c0:
                    await p.mouse.move(c0["x"] + c0["w"] / 2 + 24, c0["y"], steps=4)
                    await p.wait_for_timeout(300)
                    c1 = await p.evaluate(CHEAP_JS, c["i"])
                    if c1 and abs(c1["x"] - c0["x"]) + abs(c1["y"] - c0["y"]) > 1.5:
                        magnet.append(c["txt"] or c["tag"])
                    await p.mouse.move(4, h - 4, steps=2)
                    await p.wait_for_timeout(200)
                s0 = await p.evaluate(HSIG_JS, c["i"])
                await p.mouse.move(c["x"], c["y"], steps=4)
                await p.wait_for_timeout(380)
                s1 = await p.evaluate(HSIG_JS, c["i"])
                if s0 != s1:
                    hc += 1
                else:
                    names.append(c["tag"] + ":" + c["txt"])
                if (await p.evaluate(CHEAP_JS, c["i"])).get("tilt"):
                    tilt.append(c["txt"] or c["tag"])
                await p.mouse.move(4, h - 4, steps=2)
                await p.wait_for_timeout(160)
            item["hover_tested"] = len(cands)
            item["hover_changed"] = hc
            item["no_hover"] = names[:6]
            item["tilt_3d"] = tilt[:6]
            item["magnetic"] = magnet[:6]
        res.append(item)
    rep[tag] = {"sections": res, "errors": errs[:6]}
    await ctx.close()


async def fast_scroll(b, w, h, mobile, tag, rep):
    ctx = await b.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, user_agent=UA_M if mobile else None, locale="ko-KR")
    p = await ctx.new_page()
    await p.goto(URL, wait_until="load")
    await p.wait_for_timeout(1500)
    H = await p.evaluate("document.documentElement.scrollHeight")
    for i in range(1, 7):
        await p.evaluate(f"window.scrollTo({{top:{int(H * i / 6)}, behavior:'instant'}})")
        await p.wait_for_timeout(90)
    await p.wait_for_timeout(1200)
    stuck = []
    y = await p.evaluate("scrollY")
    while y > 0:
        r = await p.evaluate(HIDDEN_IN_VIEW_JS)
        if r["n"]:
            stuck.append({"y": int(y), **r})
        y = max(0, y - h)
        await p.evaluate(f"window.scrollTo({{top:{int(y)}, behavior:'instant'}})")
        await p.wait_for_timeout(320)
    rep[tag] = {"stuck_views": len(stuck), "detail": stuck[:5]}
    await ctx.close()


async def static_mode(b, tag, rep, js=True, reduced=False):
    ctx = await b.new_context(viewport={"width": 1440, "height": 900}, java_script_enabled=js, reduced_motion="reduce" if reduced else "no-preference", locale="ko-KR")
    p = await ctx.new_page()
    await p.goto(URL, wait_until="load")
    await p.wait_for_timeout(1500 if js else 600)
    H = await p.evaluate("document.documentElement.scrollHeight")
    y = 0
    bad = []
    while y < H:
        await p.evaluate(f"window.scrollTo({{top:{y}, behavior:'instant'}})")
        await p.wait_for_timeout(160)
        r = await p.evaluate(HIDDEN_IN_VIEW_JS)
        if r["n"]:
            bad.append({"y": y, **r})
        y += 900
    rep[tag] = {"views_with_hidden": len(bad), "detail": bad[:4]}
    await ctx.close()


async def perf(b, tag, rep, reduced=False, rate=4, w=1440, h=900):
    ctx = await b.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce" if reduced else "no-preference", locale="ko-KR")
    p = await ctx.new_page()
    await p.goto(URL, wait_until="load")
    await p.wait_for_timeout(1500)
    cdp = await ctx.new_cdp_session(p)
    await cdp.send("Emulation.setCPUThrottlingRate", {"rate": rate})
    H = await p.evaluate("document.documentElement.scrollHeight")
    steps = max(10, min(300, int(H / 100)))
    await p.evaluate(PERF_START_JS)
    for i in range(steps):
        await p.mouse.move(240 + (i * 173) % (w - 480), 160 + (i * 97) % (h - 320), steps=2)
        await p.mouse.wheel(0, 100)
        await p.wait_for_timeout(40)
    await p.wait_for_timeout(400)
    r = await p.evaluate(PERF_STOP_JS)
    await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    rep[tag] = {"cpu_slowdown": rate, "width": w, **{k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items()}}
    await ctx.close()


def sheet(frames, path):
    if not frames:
        return
    W, H = 420, 262
    rows = len(frames)
    im = Image.new("RGB", (W * 2 + 140, rows * (H + 8)), (255, 255, 255))
    d = ImageDraw.Draw(im)
    for r, (tag, idx, fa, fb) in enumerate(frames):
        y = r * (H + 8)
        d.text((6, y + 6), f"{tag} s{idx}", fill=(200, 0, 0))
        for c, f in enumerate([fa, fb]):
            t = Image.open(f).convert("RGB")
            t.thumbnail((W, H))
            im.paste(t, (140 + c * W, y))
    im.save(path, quality=78)


async def main():
    rep = {}
    frames_pc, frames_m = [], []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11"])
        await perf(b, "perf", rep)
        await perf(b, "perf_reduced", rep, reduced=True)
        await perf(b, "perf_2560", rep, w=2560, h=1440)
        if not PERF_ONLY:
            await entering(b, 1440, 900, False, "pc", rep, frames_pc)
            await entering(b, 390, 844, True, "m", rep, frames_m)
            await fast_scroll(b, 1440, 900, False, "fast_pc", rep)
            await fast_scroll(b, 390, 844, True, "fast_m", rep)
            await static_mode(b, "nojs", rep, js=False)
            await static_mode(b, "reduced", rep, reduced=True)
        await b.close()
    for k in ("perf", "perf_reduced", "perf_2560"):
        r = rep[k]
        print(f"{k} {r['width']}px cpu x{r['cpu_slowdown']}: frames={r['frames']} median={r['median']:.1f}ms p95={r['p95']:.1f}ms over50={r['over50'] * 100:.1f}% longtask={r['longtask_ms']}ms")
    if PERF_ONLY:
        (OUT / "motion.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
        return
    sheet(frames_pc, OUT / "enter_pc.jpg")
    sheet(frames_m, OUT / "enter_m.jpg")
    for _, _, fa, fb in frames_pc + frames_m:
        fa.unlink(missing_ok=True)
        fb.unlink(missing_ok=True)
    (OUT / "motion.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
    for k in ("pc", "m"):
        for s in rep[k]["sections"]:
            extra = f" hover {s.get('hover_changed')}/{s.get('hover_tested')} {s.get('no_hover', '')} tilt3d={s.get('tilt_3d', [])} magnetic={s.get('magnetic', [])}" if k == "pc" else ""
            print(f"{k} s{s['idx']} {s['id'] or s['cls'][:18]:<20} changed={s['changed']:<4} hidden_after={s['hidden_after']} rolled={s['rolled_numbers']}{extra}")
        print(k, "errors", rep[k]["errors"])
    for k in ("fast_pc", "fast_m"):
        print(k, "stuck_views", rep[k]["stuck_views"], rep[k]["detail"][:2])
    for k in ("nojs", "reduced"):
        print(k, "views_with_hidden", rep[k]["views_with_hidden"], rep[k]["detail"][:2])

asyncio.run(main())
