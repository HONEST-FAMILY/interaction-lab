"""폰에서 손가락으로 세로로 밀었을 때 페이지가 실제로 내려가는지 화면 전체를 훑어 잰다.

    python tools/web/one.py python tools/web/touchscroll.py (주소) [(주소2) …] --out (접두)
        [--sizes 390x844,416x600,870x557] [--every 0.6] [--moves 0.5:0,0.7:c60,0.3:c-60] [--wait 1500]
        [--hswipe ".hero-track,.bn-vp"]

- 창 없는 크롬(그래픽카드)을 폰으로 흉내 내고(터치·is_mobile), CDP Input.dispatchTouchEvent 로 진짜 손가락 밀기를 넣는다.
  window.scrollTo 로 내리는 perf_mobile·scrollprobe 는 이걸 못 본다. 터치 밀기는 touch-action·touchmove 막기·
  끌기 코드를 그대로 거친다(2026-11-21 #2168 시험: touch-action none·touchmove 막기 0px, pan-y 세로 밀기 정상).
- 화면 높이의 --every 배씩 내려가며, 위치마다 --moves(가로 위치:기울기°, +는 오른쪽으로 비스듬히) 대로
  화면 아래 72% 지점에서 위로 화면 34%만큼 민다. 'c60' 은 엄지처럼 처음 16px 을 60° 옆으로 갔다가 위로 휘는 밀기
  (오른손 엄지는 오른쪽 위로, 왼손 엄지는 왼쪽 위로 휜다 — 기본값이 c60·c-60 둘 다 미는 까닭). 손가락 밑 요소·touch-action 을 같이 적는다.
- 같은 날 시험: touch-action pan-y 위에서는 처음 16px 이 옆으로 간 엄지 밀기가 페이지를 0px 내렸다(그냥 바탕은 310~359px).
  크롬은 pan-y 에서 밀기 시작 방향이 옆쪽(|가로| ≥ |세로|)이면 그 밀기 전체의 스크롤을 버린다.
- 판정(기대치 = 같은 크기의 빈 페이지에서 같은 밀기로 내려간 길이. 크롬 자체의 휜 밀기 손실은 기준에 들어간다):
    막힘      페이지가 기대치의 30%도 안 내려감
    덜 감     60% 안 됨(한 번 더 밀어 봐도 그러면. 크롬을 여럿 같이 돌리면 튕김 길이가 흔들려서)
    되돌아감  민 뒤 30px 넘게 도로 올라감(스크립트가 스크롤을 끌어당김)
    끌기 같이 시작  세로로 밀었는데 페이지 스크립트가 끌기를 잡음(setPointerCapture) — 배너가 같이 밀리거나 넘어감
    touch 막음  스크립트가 touchstart·touchmove 를 preventDefault
    스크롤 끼어듦  손가락을 대고 있는 동안·직후 스크립트가 window.scrollTo 등으로 스크롤을 움직임
- 화면에 붙는 고정 장면(position: sticky, 화면 높이 절반 넘는 것 — 머리글·탭 줄은 뺀다)마다 붙어 있는 길이(px·화면 수)도 적는다.
  손가락으로 몇 번 밀어야 지나가는지 보는 값.
- 가로로 넘기는 줄(overflow-x auto)이 세로로도 몇 px 넘치면(overflow-y 가 저절로 auto) 그 위에서 똑바로 위로 민
  첫 밀기를 줄이 먹고 페이지는 0px 내려간다(#2168 1안 카드 줄 8px·4안 상품 줄 18px). 끝까지 내린 뒤 이런 상자를 전부 찾아 적는다.
  고치는 법: 그 줄에 overflow-y: hidden(보이는 모양은 같다 — auto 도 원래 잘라 보였다).
- 폰 기본 스크롤로 옆으로 넘기는 줄(overflow-x auto)은 overflow-y 를 막아도, 엄지가 처음에 40° 넘게 비스듬히(줄이 넘어갈 수 있는
  쪽으로) 출발하면 그 밀기 전체를 줄이 잡는다 — 줄은 1~7px 옆으로 가고 페이지는 0px(#2168 시험, 30°까지는 페이지가 내려감).
  overscroll-behavior-x: contain 이 걸린 줄은 끝에 닿아 있어도 잡는다. 그래서 이런 줄도 '가로 줄 폰 기본 스크롤' 로 적는다.
  고치는 법: 폰(hover: none, pointer: coarse)에서는 줄을 overflow hidden 으로 두고 옆으로 넘기기를 스크립트로(세로 우선 판정 →
  확실히 옆일 때만 손가락 따라 넘기고 튕김·자석 정렬) — 본보기 /previews/kvault-2168/shared/kv.js 의 KV.rail.
- --hswipe 로 준 끌기 장면·가로 줄은 끝에 옆으로 한 번 밀어, 끌기가 잡히거나(setPointerCapture) 줄이 20px 넘게 넘어가고 페이지는 세로로 안 움직이는지 본다.
  세로 밀기를 양보하게 고친 뒤에도 옆으로 끄는 효과가 살아 있는지 확인하는 칸.
- 결과: (접두).json, (접두).md. 마지막 줄 = 크기마다 문제 위치 수(0이면 통과).
"""
import sys, asyncio, json, math, argparse, time
from playwright.async_api import async_playwright

ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]

INIT = r"""
(() => {
  if (window.__ts) return;
  const T = window.__ts = { caps: [], pd: [], js: [], on: false, maxY: 0, sc: null };
  const desc = (el) => {
    if (!el || el === window) return 'window';
    if (el === document) return 'document';
    if (!el.tagName) return String(el);
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = ((el.getAttribute && el.getAttribute('class')) || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (c.length) s += '.' + c.join('.');
    return s;
  };
  T.desc = desc;
  T.y = () => (T.sc ? T.sc.scrollTop : window.scrollY);
  const spc = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (id) { if (T.on) T.caps.push(desc(this)); return spc.call(this, id); };
  const pd = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function () {
    if (T.on && (this.type === 'touchstart' || this.type === 'touchmove') && this.cancelable) T.pd.push(this.type + '@' + desc(this.currentTarget));
    return pd.call(this);
  };
  T.raw = {};
  for (const n of ['scrollTo', 'scroll', 'scrollBy']) {
    const f = window[n];
    T.raw[n] = f.bind(window);
    window[n] = function () { if (T.on) T.js.push('window.' + n); return f.apply(this, arguments); };
  }
  const sv = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () { if (T.on) T.js.push('scrollIntoView@' + desc(this)); return sv.apply(this, arguments); };
  const st = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true, get: st.get,
    set(v) { if (T.on && (this === document.scrollingElement || this === T.sc)) T.js.push('scrollTop@' + desc(this)); return st.set.call(this, v); }
  });
  const loop = () => { if (T.on) { const y = T.y(); if (y > T.maxY) T.maxY = y; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();
"""

FIND_SCROLLER = r"""
() => {
  const T = window.__ts, se = document.scrollingElement;
  document.documentElement.style.scrollBehavior = 'auto';
  if (se.scrollHeight - innerHeight > 50) { T.sc = null; return { kind: 'page', max: se.scrollHeight - innerHeight }; }
  let best = null, bestGap = 0;
  for (const el of document.querySelectorAll('*')) {
    const gap = el.scrollHeight - el.clientHeight;
    if (gap < 50 || el.clientHeight < innerHeight * 0.5) continue;
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && gap > bestGap) { best = el; bestGap = gap; }
  }
  T.sc = best;
  return best ? { kind: 'inner', el: T.desc(best), max: bestGap } : { kind: 'none', max: 0 };
}
"""

AT = r"""
([x, y]) => {
  const T = window.__ts, el = document.elementFromPoint(x, y);
  if (!el) return { el: '', sec: '', ta: '' };
  const chain = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const ta = getComputedStyle(n).touchAction;
    if (ta && ta !== 'auto') chain.push(T.desc(n) + ' ' + ta);
  }
  let m = el;
  while (m && m.nodeType === 1 && !m.id && !((m.getAttribute('class') || '').trim())) m = m.parentElement;
  const sec = el.closest('section, header, footer, nav, aside, [class*="sec"], [id]');
  return { el: T.desc(m || el), sec: sec && sec !== m ? T.desc(sec) : '', ta: chain.join(' > ') };
}
"""

TRAPS = r"""
() => {
  const out = [], T = window.__ts, se = document.scrollingElement;
  for (const el of document.querySelectorAll('*')) {
    if (el === se || el === document.body || el === T.sc) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const ox = cs.overflowX, oy = cs.overflowY;
    const userY = (oy === 'auto' || oy === 'scroll') && el.scrollHeight - el.clientHeight > 0;
    if (!userY) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    const xRail = (ox === 'auto' || ox === 'scroll') && el.scrollWidth - el.clientWidth > 0;
    out.push({ el: T.desc(el), kind: xRail ? '가로 줄인데 세로로도 밀림' : '안쪽 세로 상자', extraY: el.scrollHeight - el.clientHeight, top: Math.round(r.top + scrollY), h: Math.round(r.height), ob: cs.overscrollBehaviorY });
  }
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || !(cs.overflowX === 'auto' || cs.overflowX === 'scroll') || !(cs.overflowY === 'auto' || cs.overflowY === 'scroll')) continue;
    if (el.scrollWidth - el.clientWidth <= 0 || el.scrollHeight - el.clientHeight > 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) continue;
    out.push({ el: T.desc(el), kind: '가로 줄 세로 자리 열림', extraY: 0, top: Math.round(r.top + scrollY), h: Math.round(r.height), ob: cs.overscrollBehaviorY });
  }
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !(cs.overflowX === 'auto' || cs.overflowX === 'scroll')) continue;
    if (el.scrollWidth - el.clientWidth <= 2) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) continue;
    out.push({ el: T.desc(el), kind: '가로 줄 폰 기본 스크롤', extraY: 0, top: Math.round(r.top + scrollY), h: Math.round(r.height), ob: cs.overscrollBehaviorX });
  }
  return out;
}
"""

STICKY = r"""
() => {
  const out = [], vh = innerHeight, T = window.__ts;
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky' || cs.display === 'none') continue;
    const p = el.parentElement; if (!p) continue;
    if (el.getBoundingClientRect().height < vh * 0.5) continue;
    const span = p.getBoundingClientRect().height - el.getBoundingClientRect().height;
    if (span < vh * 0.3) continue;
    out.push({ el: T.desc(el), parent: T.desc(p), top: Math.round(p.getBoundingClientRect().top + scrollY), span: Math.round(span), screens: +(span / vh).toFixed(2) });
  }
  return out;
}
"""


def parse_moves(s):
    out = []
    for part in s.split(","):
        x, a = part.split(":")
        curved = a.startswith("c")
        out.append((float(x), "c" if curved else "s", float(a[1:] if curved else a)))
    return out


def path(x, y, kind, ang, D, steps=16):
    r = math.radians(ang)
    if kind == "s":
        dx, dy = D * math.sin(r), -D * math.cos(r)
        return [(x + dx * i / steps, y + dy * i / steps) for i in range(steps + 1)], D * math.cos(r)
    first = 16.0
    pts = [(x, y)]
    for i in range(1, 4):
        pts.append((x + first * math.sin(r) * i / 3, y - first * math.cos(r) * i / 3))
    ex, ey = pts[-1]
    rest = steps - 3
    for i in range(1, rest + 1):
        pts.append((ex + 6 * math.copysign(1, ang) * i / rest, ey - (D - first) * i / rest))
    return pts, D - first + first * math.cos(r)


async def swipe(cdp, pts, ms=260):
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": pts[0][0], "y": pts[0][1]}]})
    for (x, y) in pts[1:]:
        await asyncio.sleep(ms / (len(pts) - 1) / 1000)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y}]})
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


PLAIN = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'></head><body style='margin:0'>" + "<div style='height:400px;border-bottom:1px solid #ccc'></div>" * 40 + "</body></html>"


async def control(ctx, w, h, moves):
    pg = await ctx.new_page()
    await pg.set_content(PLAIN)
    cdp = await ctx.new_cdp_session(pg)
    D = h * 0.34
    out = {}
    for (fx, kind, ang) in moves:
        best = 0
        for _ in range(2):
            await pg.evaluate("window.scrollTo(0, 4000)")
            await pg.wait_for_timeout(160)
            y0 = await pg.evaluate("scrollY")
            pts, exp = path(w * fx, h * 0.72, kind, ang, D)
            await swipe(cdp, pts)
            await pg.wait_for_timeout(520)
            best = max(best, await pg.evaluate("scrollY") - y0)
        out[(fx, kind, ang)] = best
    await pg.close()
    return out


async def set_y(pg, y):
    await pg.evaluate("(y) => { const T = window.__ts; if (T.sc) T.sc.scrollTop = y; else T.raw.scrollTo(0, y); }", y)


HTARGET = r"""
(sel) => {
  const T = window.__ts, vh = innerHeight;
  for (const el of document.querySelectorAll(sel)) {
    const r0 = el.getBoundingClientRect();
    if (r0.width < 60 || r0.height < 20 || getComputedStyle(el).visibility === 'hidden') continue;
    const ox = getComputedStyle(el).overflowX;
    if (el._kvRail && !el._kvRail.on) continue;
    if ((el.classList.contains('kv-rail') || ox === 'auto' || ox === 'scroll') && el.scrollWidth <= el.clientWidth + 2) continue;
    const y = Math.max(0, r0.top + T.y() - (vh - Math.min(r0.height, vh * 0.8)) / 2);
    return { y: y, w: r0.width, h: r0.height, el: T.desc(el) };
  }
  return null;
}
"""

HPOINT = r"""
(sel) => {
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 20 || r.bottom < 0 || r.top > innerHeight) continue;
    const top = Math.max(r.top, 0), bot = Math.min(r.bottom, innerHeight);
    document.querySelectorAll('[data-ts-h]').forEach(x => x.removeAttribute('data-ts-h'));
    el.setAttribute('data-ts-h', '1');
    return { x: r.left + r.width * 0.75, y: (top + bot) / 2, w: r.width, sl: el.scrollLeft };
  }
  return null;
}
"""


async def hswipes(pg, cdp, sels):
    out = []
    for sel in sels:
        t = await pg.evaluate(HTARGET, sel)
        if not t:
            continue
        await set_y(pg, t["y"])
        await pg.wait_for_timeout(350)
        pt = await pg.evaluate(HPOINT, sel)
        if not pt:
            continue
        y0 = await pg.evaluate("window.__ts.y()")
        await pg.evaluate("() => { const T = window.__ts; T.caps = []; T.pd = []; T.js = []; T.maxY = T.y(); T.on = true; }")
        dx = -min(pt["w"] * 0.5, 220)
        n = 14
        await swipe(cdp, [(pt["x"] + dx * i / n, pt["y"] + dx * 0.1 * i / n) for i in range(n + 1)], ms=240)
        await pg.wait_for_timeout(900)
        r = await pg.evaluate("() => { const T = window.__ts; T.on = false; const h = document.querySelector('[data-ts-h]'); return { y: T.y(), caps: T.caps.slice(0, 3), pd: T.pd.length, sl: h ? h.scrollLeft : 0 }; }")
        slid = round(r["sl"] - pt["sl"])
        ok = (bool(r["caps"]) or abs(slid) >= 20) and abs(r["y"] - y0) < 12
        out.append({"sel": sel, "el": t["el"], "caps": r["caps"], "slid": slid, "page_moved": round(r["y"] - y0), "ok": ok})
    return out


async def probe(ctx_args, browser, url, w, h, every, moves, wait, hsel=None):
    ctx = await browser.new_context(viewport={"width": w, "height": h}, **ctx_args)
    ctrl = await control(ctx, w, h, moves)
    await ctx.add_init_script(INIT)
    pg = await ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    await pg.goto(url, wait_until="load")
    await pg.wait_for_timeout(wait)
    cdp = await ctx.new_cdp_session(pg)
    sc = await pg.evaluate(FIND_SCROLLER)
    sticky = await pg.evaluate(STICKY)
    rows = []
    D = h * 0.34
    y = 0.0
    maxs = sc["max"]
    while y <= maxs:
        for (fx, kind, ang) in moves:
            await set_y(pg, y)
            await pg.wait_for_timeout(160)
            y0 = await pg.evaluate("window.__ts.y()")
            sx, sy = w * fx, h * 0.72
            pts, exp = path(sx, sy, kind, ang, D)
            if y0 + exp * 0.35 > maxs:
                continue
            at = await pg.evaluate(AT, [sx, sy])
            await pg.evaluate("() => { const T = window.__ts; T.caps = []; T.pd = []; T.js = []; T.maxY = T.y(); T.on = true; }")
            await swipe(cdp, pts)
            await pg.wait_for_timeout(520)
            r = await pg.evaluate("() => { const T = window.__ts; T.on = false; return { y: T.y(), maxY: T.maxY, caps: T.caps.slice(0, 4), pd: T.pd.slice(0, 4), js: Array.from(new Set(T.js)).slice(0, 4), sx: window.scrollX }; }")
            moved = r["y"] - y0
            room = maxs - y0
            want = min(ctrl[(fx, kind, ang)] or exp, room)
            flags = []
            if moved < want * 0.3:
                flags.append("막힘")
            elif moved < want * 0.6:
                await set_y(pg, y0)
                await pg.wait_for_timeout(200)
                await swipe(cdp, pts)
                await pg.wait_for_timeout(520)
                again = await pg.evaluate("window.__ts.y()") - y0
                if again < want * 0.6:
                    flags.append("덜 감")
            if r["maxY"] - r["y"] > 30:
                flags.append("되돌아감")
            if r["caps"]:
                flags.append("끌기 같이 시작")
            if r["pd"]:
                flags.append("touch 막음")
            if r["js"]:
                flags.append("스크롤 끼어듦")
            if abs(r["sx"]) > 1:
                flags.append("가로로 밀림")
            rows.append({"y": round(y0), "x": round(sx), "move": ("휜 " if kind == "c" else "") + f"{ang:+.0f}°", "want": round(want), "moved": round(moved), "back": round(r["maxY"] - r["y"]),
                         "flags": flags, "el": at["el"], "sec": at["sec"], "ta": at["ta"], "caps": r["caps"], "pd": r["pd"], "js": r["js"]})
        y += h * every
    await set_y(pg, 0)
    await pg.wait_for_timeout(200)
    traps = await pg.evaluate(TRAPS)
    hs = await hswipes(pg, cdp, hsel) if hsel else []
    await ctx.close()
    return {"url": url, "size": f"{w}x{h}", "control": {f"{k[0]}:{'c' if k[1] == 'c' else ''}{k[2]:g}": round(v) for k, v in ctrl.items()}, "scroller": sc, "sticky": sticky, "traps": traps, "hswipe": hs, "rows": rows, "errors": errs[:6]}


def md(results):
    L = ["# 폰 세로 밀기 검사 (touchscroll.py)", ""]
    for res in results:
        bad = [r for r in res["rows"] if r["flags"]]
        L.append(f"## {res['url']} · {res['size']} — 밀기 {len(res['rows'])}번 · 문제 {len(bad)}번 · 세로 함정 상자 {len([t for t in res['traps'] if t['kind'].startswith('가로')])}개")
        L.append(f"- 기준(같은 크기 빈 페이지에서 같은 밀기로 내려간 px): {res['control']}")
        sc = res["scroller"]
        if sc["kind"] != "page":
            L.append(f"- ⚠ 페이지가 문서가 아니라 안쪽 상자에서 스크롤됨: {sc.get('el', '없음')}")
        for s in res["sticky"]:
            L.append(f"- 고정 구간 {s['el']} (부모 {s['parent']}, 문서 {s['top']}px부터): {s['span']}px = 화면 {s['screens']}개")
        for t in res["traps"]:
            if t["kind"] == "가로 줄 폰 기본 스크롤":
                L.append(f"- ⚠ {t['kind']}: {t['el']} (문서 {t['top']}px, 높이 {t['h']}px{', overscroll-behavior-x ' + t['ob'] if t['ob'] != 'auto' else ''}) — 엄지가 40° 넘게 비스듬히 출발하면 이 줄이 밀기를 잡고 페이지는 멈춤. 폰에서는 KV.rail 처럼 세로 우선으로")
            elif t["kind"] == "가로 줄 세로 자리 열림":
                L.append(f"- ⚠ {t['kind']}: {t['el']} (문서 {t['top']}px, 높이 {t['h']}px) overflow-y 가 저절로 auto — 지금은 0px 이지만 카드가 움직이는 동안 세로로 넘치면 그 밀기를 먹는다. overflow-y: hidden")
            else:
                L.append(f"- ⚠ {t['kind']}: {t['el']} (문서 {t['top']}px, 높이 {t['h']}px) 세로로 {t['extraY']}px 더 밀림 — 이 위에서 세로로 밀면 첫 밀기를 이 상자가 먹고 페이지는 안 내려감")
        if bad:
            L.append("")
            L.append("| 위치 y | 손가락 x | 기울기 | 기대 | 내려감 | 문제 | 손가락 밑 | 구역 | touch-action | 잡은 것 |")
            L.append("|---|---|---|---|---|---|---|---|---|---|")
            for r in bad:
                got = ", ".join(r["caps"] + r["pd"] + r["js"])
                L.append(f"| {r['y']} | {r['x']} | {r['move']} | {r['want']} | {r['moved']} | {' · '.join(r['flags'])} | {r['el']} | {r['sec']} | {r['ta']} | {got} |")
        for hs in res.get("hswipe", []):
            L.append(f"- 가로 끌기 {hs['el']}: {'됨' if hs['ok'] else '안 됨'} (끌기 잡음 {', '.join(hs['caps']) or '없음'} · 옆으로 {hs.get('slid', 0)}px · 페이지 세로 {hs['page_moved']}px)")
        if res["errors"]:
            L.append(f"- 페이지 오류: {res['errors']}")
        L.append("")
    return "\n".join(L)


async def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--sizes", default="390x844,416x600,870x557")
    ap.add_argument("--every", type=float, default=0.6)
    ap.add_argument("--moves", default="0.5:0,0.7:c60,0.3:c-60")
    ap.add_argument("--wait", type=int, default=1500)
    ap.add_argument("--dpr", type=float, default=2.625)
    ap.add_argument("--hswipe", default="", help="옆으로 끄는 장면·가로 줄 선택자(쉼표). 그 위를 옆으로 밀어 끌기·넘기기가 그대로 되는지 본다")
    a = ap.parse_args()
    moves = parse_moves(a.moves)
    sizes = [tuple(int(v) for v in s.split("x")) for s in a.sizes.split(",")]
    results = []
    t0 = time.time()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        ctx_args = {"device_scale_factor": a.dpr, "is_mobile": True, "has_touch": True, "service_workers": "block"}
        for url in a.urls:
            for (w, h) in sizes:
                res = await probe(ctx_args, b, url, w, h, a.every, moves, a.wait, [x.strip() for x in a.hswipe.split(",") if x.strip()])
                results.append(res)
                bad = len([r for r in res["rows"] if r["flags"]])
                rail = len([t for t in res["traps"] if t["kind"].startswith("가로")])
                hs = res["hswipe"]
                hk = f" · 가로 끌기 {len([x for x in hs if x['ok']])}/{len(hs)} 됨" if hs else ""
                print(f"{url} {w}x{h}: 밀기 {len(res['rows'])}번 · 문제 {bad}번 · 세로 함정 가로 줄 {rail}개{hk} ({round(time.time() - t0)}초)", flush=True)
        await b.close()
    json.dump(results, open(a.out + ".json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(a.out + ".md", "w", encoding="utf-8").write(md(results))
    total = sum(len([r for r in res["rows"] if r["flags"]]) + len([t for t in res["traps"] if t["kind"].startswith("가로")]) for res in results)
    print("판정:", "통과 (문제 0)" if total == 0 else f"문제 {total}번 — {a.out}.md", flush=True)


asyncio.run(main())
