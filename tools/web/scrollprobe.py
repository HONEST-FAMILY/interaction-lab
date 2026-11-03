import argparse
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
FONTS = ["C:/Windows/Fonts/malgunbd.ttf", "C:/Windows/Fonts/malgun.ttf", "/System/Library/Fonts/AppleSDGothicNeo.ttc", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"]

LABEL_JS = r"""
window.__spLab = (e) => {
  if (!e || !e.tagName) return '';
  const tag = e.tagName.toLowerCase();
  const cls = ((e.getAttribute && e.getAttribute('class')) || '').trim().split(/\s+/)[0];
  const id = e.id ? '#' + e.id : '';
  let t = '';
  if (e.children.length <= 2) t = (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 16);
  return tag + (cls ? '.' + cls : '') + id + (t ? ' "' + t + '"' : '');
};
"""

INIT_JS = r"""(a) => {
  const lab = window.__spLab, vw = innerWidth, vh = innerHeight, minArea = vw * vh * 0.02;
  const picked = [];
  for (const e of document.querySelectorAll('body *')) {
    if (picked.length >= a.max) break;
    const tag = e.tagName.toLowerCase();
    const inSvg = e.closest('svg') && tag !== 'svg';
    const cs = getComputedStyle(e);
    if (cs.display === 'none') continue;
    if (inSvg && !(tag === 'path' && cs.strokeDasharray !== 'none' && cs.stroke !== 'none')) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const top = r.top + scrollY;
    if (top > a.to + vh * 1.2 || r.bottom + scrollY < 0) continue;
    const media = ['img', 'video', 'canvas', 'svg', 'picture', 'path'].includes(tag);
    const fs = parseFloat(cs.fontSize);
    const textLeaf = e.children.length === 0 && (e.textContent || '').trim() && fs >= 22;
    const heading = /^h[1-3]$/.test(tag);
    const big = r.width * r.height >= minArea;
    const moving = cs.clipPath !== 'none' || cs.transform !== 'none' || parseFloat(cs.opacity) < 1 || cs.position === 'sticky' || cs.position === 'fixed' || cs.visibility === 'hidden';
    if (!(media || textLeaf || heading || big || moving)) continue;
    picked.push(e);
  }
  window.__sp = picked;
  return picked.map((e) => [lab(e), Math.round(e.getBoundingClientRect().width * e.getBoundingClientRect().height), getComputedStyle(e).position]);
}"""

SAMPLE_JS = r"""() => {
  const out = [];
  for (const e of window.__sp) {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    let op = cs.visibility === 'hidden' ? 0 : 1;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const o = parseFloat(getComputedStyle(n).opacity); if (!isNaN(o)) op *= o; }
    let sc = 1, tx = 0, ty = 0;
    const m = cs.transform;
    if (m && m !== 'none') {
      const v = m.match(/matrix(3d)?\(([^)]+)\)/);
      if (v) { const k = v[2].split(',').map(Number); if (v[1]) { sc = Math.hypot(k[0], k[1], k[2]); tx = k[12]; ty = k[13]; } else { sc = Math.hypot(k[0], k[1]); tx = k[4]; ty = k[5]; } }
    }
    const dash = e.tagName.toLowerCase() === 'path' ? parseFloat(cs.strokeDashoffset) || 0 : 0;
    out.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), +op.toFixed(3), +sc.toFixed(3), Math.round(tx), Math.round(ty), cs.clipPath === 'none' ? '' : cs.clipPath.slice(0, 90), Math.round(dash), cs.filter === 'none' ? '' : cs.filter.slice(0, 60)]);
  }
  return [Math.round(scrollY), out];
}"""

LIBS_JS = r"""() => {
  const lab = window.__spLab, r = {};
  r.gsap = window.gsap ? (window.gsap.version || 'yes') : null;
  const props = (an) => {
    if (!an) return '';
    const kids = an.getChildren ? an.getChildren(true, true, false) : [an];
    return kids.slice(0, 5).map((c) => {
      const tg = c.targets ? c.targets().slice(0, 2).map(lab).join(', ') : '';
      const skip = ['ease', 'duration', 'overwrite', 'delay', 'stagger', 'immediateRender', 'onUpdate', 'onComplete', 'onStart', 'scrollTrigger', 'parent', 'startAt', 'lazy', 'runBackwards', 'data', 'id', 'callbackScope', 'inherit', 'paused', 'repeat', 'yoyo', 'keyframes'];
      const keys = Object.keys(c.vars || {}).filter((k) => !skip.includes(k));
      return tg + ' {' + keys.map((k) => { const v = c.vars[k]; return k + (v !== null && typeof v === 'object' ? '' : ':' + String(v).slice(0, 24)); }).join(', ') + '}';
    }).join(' / ');
  };
  if (window.ScrollTrigger && window.ScrollTrigger.getAll) {
    r.st = window.ScrollTrigger.getAll().slice(0, 40).map((t) => ({ trigger: lab(t.trigger), start: Math.round(t.start), end: Math.round(t.end), pin: t.pin ? lab(t.pin) : '', scrub: t.vars && t.vars.scrub !== undefined ? t.vars.scrub : '', anim: props(t.animation) }));
  }
  const h = document.documentElement;
  r.lenis = !!(window.lenis || h.classList.contains('lenis') || h.classList.contains('lenis-smooth') || document.querySelector('.lenis'));
  if (window.lenis && window.lenis.options) r.lenisOpts = { lerp: window.lenis.options.lerp, duration: window.lenis.options.duration };
  r.locomotive = !!document.querySelector('[data-scroll-container], .has-scroll-smooth');
  r.three = !!window.THREE;
  r.lottie = !!(window.lottie || window.bodymovin);
  r.swiper = document.querySelectorAll('.swiper, .swiper-container').length;
  r.canvas = [...document.querySelectorAll('canvas')].slice(0, 8).map((c) => { const b = c.getBoundingClientRect(); return [lab(c), Math.round(b.width), Math.round(b.height), Math.round(b.top + scrollY)]; });
  r.video = [...document.querySelectorAll('video')].slice(0, 8).map((v) => { const b = v.getBoundingClientRect(); return [lab(v), Math.round(b.width), Math.round(b.height), Math.round(b.top + scrollY)]; });
  r.dash = [...document.querySelectorAll('path')].filter((p) => { const cs = getComputedStyle(p); return cs.strokeDasharray !== 'none' && cs.stroke !== 'none'; }).slice(0, 8).map((p) => { const cs = getComputedStyle(p); return [lab(p.closest('svg') || p), cs.strokeWidth, Math.round(p.getTotalLength ? p.getTotalLength() : 0), cs.stroke.slice(0, 40)]; });
  r.height = document.documentElement.scrollHeight;
  return r;
}"""

EPS = {"w": 3, "h": 3, "op": 0.03, "sc": 0.006, "tx": 3, "ty": 3, "pin": 4, "dash": 2}
NAMES = {"w": "폭", "h": "높이", "op": "투명도", "sc": "확대", "tx": "가로 이동", "ty": "세로 이동", "pin": "자리(고정·느리게)", "clip": "잘라내기", "dash": "선 그리기", "filter": "필터"}


def font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def fmt(p, v):
    if p in ("op", "sc"):
        return f"{v:.2f}"
    if p in ("clip", "filter"):
        return v or "없음"
    return f"{v:.0f}"


def series(samples, i):
    rows = []
    for y, vals in samples:
        x, top, w, h, op, sc, tx, ty, clip, dash, flt = vals[i]
        rows.append({"y": y, "w": w, "h": h, "op": op, "sc": sc, "tx": tx, "ty": ty, "pin": top + y, "clip": clip, "dash": dash, "filter": flt, "top": top})
    return rows


def changes(rows, p):
    idx = []
    for k in range(1, len(rows)):
        a, b = rows[k - 1][p], rows[k][p]
        if p in ("clip", "filter"):
            if a != b:
                idx.append(k)
        elif abs(b - a) > EPS[p]:
            idx.append(k)
    return idx


def analyse(samples, labels, vh):
    out = []
    for i, (label, area, pos) in enumerate(labels):
        rows = series(samples, i)
        if not any(r["top"] < vh and r["top"] + r["h"] > 0 for r in rows):
            continue
        for p in ("w", "h", "op", "sc", "tx", "ty", "pin", "clip", "dash", "filter"):
            idx = changes(rows, p)
            if not idx:
                continue
            s, e = idx[0] - 1, idx[-1]
            a, b = rows[s][p], rows[e][p]
            note = ""
            if p == "pin":
                dy = rows[e]["y"] - rows[s]["y"]
                rate = (b - a) / dy if dy else 0
                if abs(rate - 1) < 0.08:
                    note = "화면에 고정"
                elif 0 < rate < 1:
                    note = f"스크롤보다 느리게(비율 {1 - rate:.2f})"
                elif rate < 0:
                    note = "스크롤과 반대로"
                else:
                    note = f"스크롤보다 빠르게(비율 {1 - rate:.2f})"
                a, b = rows[s]["top"], rows[e]["top"]
            if p in ("clip", "filter"):
                mag = area
            elif p == "op":
                mag = area * abs(b - a)
            elif p == "sc":
                mag = area * abs(b - a) * 4
            elif p == "pin":
                mag = area * 0.5
            else:
                mag = area * min(1.0, abs(b - a) / 300)
            out.append({"el": label, "prop": p, "start": rows[s]["y"], "end": rows[e]["y"], "from": a, "to": b, "note": note, "mag": mag, "steps": len(idx)})
    seen, uniq = {}, []
    for r in sorted(out, key=lambda r: -r["mag"]):
        key = (r["prop"], r["start"], r["end"], fmt(r["prop"], r["from"]), fmt(r["prop"], r["to"]))
        if key in seen:
            seen[key]["same"] = seen[key].get("same", 0) + 1
            continue
        seen[key] = r
        uniq.append(r)
    return uniq


async def inertia(pg, w, h):
    await pg.evaluate(f"window.scrollTo(0,{h})")
    await pg.wait_for_timeout(1200)
    await pg.mouse.move(w / 2, h / 2)
    y0 = await pg.evaluate("scrollY")
    await pg.mouse.wheel(0, 240)
    trace = []
    for _ in range(70):
        trace.append(await pg.evaluate("scrollY"))
        await pg.wait_for_timeout(16)
    end = trace[-1] - y0
    if end <= 0:
        return "휠로 안 움직임(스크롤 대신 다른 방식)"
    k90 = next((k for k, v in enumerate(trace) if v - y0 >= end * 0.9), len(trace))
    over = max(trace) - y0 > end + 3
    if k90 <= 2:
        return "보통 스크롤(휠 한 번에 바로 도착)"
    return f"관성 스크롤: 휠 한 번(240) 뒤 90% 도착까지 약 {k90 * 16 + 16}ms{', 넘쳤다 돌아옴' if over else ''}"


def sheet(shots, out, w):
    if not shots:
        return None
    f = font(22)
    tw = 560
    ims = []
    for y, path in shots:
        im = Image.open(path).convert("RGB")
        im = im.resize((tw, int(im.height * tw / im.width)))
        cell = Image.new("RGB", (tw, im.height + 36), (17, 17, 17))
        cell.paste(im, (0, 36))
        ImageDraw.Draw(cell).text((10, 5), f"스크롤 {y}px", fill=(255, 255, 255), font=f)
        ims.append(cell)
    cols = 4
    rows = (len(ims) + cols - 1) // cols
    ch = max(c.height for c in ims)
    sh = Image.new("RGB", (cols * tw + (cols - 1) * 8, rows * ch + (rows - 1) * 8), (255, 255, 255))
    for k, c in enumerate(ims):
        sh.paste(c, ((k % cols) * (tw + 8), (k // cols) * (ch + 8)))
    sh.save(out, quality=80)
    return out


async def main():
    ap = argparse.ArgumentParser(description="첫 화면 스크롤 장면 실측: 스크롤 위치마다 요소 크기, 투명도, 확대, 잘라내기, 고정을 재서 무엇이 몇 px에 시작하고 끝나는지 표로 만든다")
    ap.add_argument("url")
    ap.add_argument("--out", required=True, help="출력 접두 (접두.md, 접두.json, 접두_y00000.jpg, 접두_sheet.jpg)")
    ap.add_argument("--to", type=int, default=0, help="어디까지 잴지 px (기본 화면 높이의 3배)")
    ap.add_argument("--step", type=int, default=45)
    ap.add_argument("--settle", type=int, default=650, help="한 칸 내린 뒤 기다리는 ms (GSAP scrub 지연이 크면 1200)")
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--wait", type=int, default=3000, help="처음 열고 기다리는 ms (인트로가 길면 늘린다)")
    ap.add_argument("--shots", default="", help="캡처할 스크롤 위치 px, 쉼표로 (기본: 화면 높이의 0, 0.35, 0.7, 1.05, 1.4, 2, 3배)")
    ap.add_argument("--max", type=int, default=400, help="잴 요소 최대 수")
    ap.add_argument("--jump", action="store_true", help="휠 대신 scrollTo로 내린다(휠이 안 먹는 사이트)")
    a = ap.parse_args()
    to = a.to or a.h * 3
    shots_at = [int(x) for x in a.shots.split(",") if x.strip()] if a.shots else sorted({int(a.h * k) for k in (0, 0.35, 0.7, 1.05, 1.4, 2, 3) if a.h * k <= to})
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        mobile = a.w < 760
        ctx = await b.new_context(viewport={"width": a.w, "height": a.h}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        await pg.goto(a.url, wait_until="load", timeout=60000)
        await pg.evaluate(LABEL_JS)
        await pg.wait_for_timeout(a.wait)
        libs = await pg.evaluate(LIBS_JS)
        labels = await pg.evaluate(INIT_JS, {"to": to, "max": a.max})
        samples, shots = [], []
        await pg.mouse.move(a.w / 2, a.h / 2)
        pending, stuck = list(shots_at), 0
        while True:
            y, vals = await pg.evaluate(SAMPLE_JS)
            samples.append((y, vals))
            while pending and y >= pending[0] - a.step / 2:
                path = f"{a.out}_y{y:05d}.jpg"
                await pg.screenshot(path=path, type="jpeg", quality=72)
                shots.append((y, path))
                pending.pop(0)
            if y >= to - 2 or stuck >= 6:
                break
            if a.jump or stuck >= 2:
                await pg.evaluate(f"window.scrollTo(0,{min(to, y + a.step)})")
            else:
                await pg.mouse.wheel(0, min(a.step, to - y))
            await pg.wait_for_timeout(a.settle)
            ny = await pg.evaluate("Math.round(scrollY)")
            stuck = stuck + 1 if ny <= y else 0
        scroll_kind = await inertia(pg, a.w, a.h)
        await b.close()
    allrows = analyse(samples, labels, a.h)
    rows = [r for r in allrows if r["end"] > r["start"]]
    idle = [r for r in allrows if r["end"] <= r["start"]]
    lines = [f"# 스크롤 장면 실측 {a.url}", f"- 화면 {a.w}x{a.h}, 0~{samples[-1][0]}px를 {a.step}px씩 {len(samples)}번 잼, 요소 {len(labels)}개, 페이지 높이 {libs.get('height')}px",
             f"- 스크롤: {scroll_kind}" + (" · Lenis" if libs.get("lenis") else "") + (f" (lerp {libs['lenisOpts'].get('lerp')}, duration {libs['lenisOpts'].get('duration')})" if libs.get("lenisOpts") else "") + (" · Locomotive" if libs.get("locomotive") else ""),
             f"- 라이브러리: GSAP {libs.get('gsap') or '없음'}, ScrollTrigger {len(libs.get('st') or []) or '없음'}, Three.js {'있음' if libs.get('three') else '없음'}, Lottie {'있음' if libs.get('lottie') else '없음'}, Swiper {libs.get('swiper') or 0}개"]
    if libs.get("canvas"):
        lines.append("- 캔버스: " + " / ".join(f"{c[0]} {c[1]}x{c[2]} (위에서 {c[3]}px)" for c in libs["canvas"]))
    if libs.get("video"):
        lines.append("- 영상: " + " / ".join(f"{v[0]} {v[1]}x{v[2]} (위에서 {v[3]}px)" for v in libs["video"]))
    if libs.get("dash"):
        lines.append("- 선 그리기 path(stroke-dasharray): " + " / ".join(f"{d[0]} 굵기 {d[1]} 길이 {d[2]} 색 {d[3]}" for d in libs["dash"]))
    if errs:
        lines.append(f"- 페이지 오류 {len(errs)}건: {errs[0]}")
    if libs.get("st"):
        lines += ["", "## ScrollTrigger (정확한 시작·끝 px. 아래 표보다 이것을 믿는다)", "", "| 트리거 | 시작 | 끝 | 고정 | scrub | 움직이는 것 |", "|---|---|---|---|---|---|"]
        for t in sorted(libs["st"], key=lambda t: t["start"]):
            lines.append(f"| {t['trigger']} | {t['start']} | {t['end']} | {t['pin']} | {t['scrub']} | {t['anim'][:140]} |")
    lines += ["", "## 스크롤 위치마다 잰 변화 (큰 것부터 30개를 시작 순으로. scrub 지연만큼 늦게 잡힐 수 있다)", "", "| 요소 | 무엇 | 시작 px | 끝 px | 처음 | 끝 | 메모 |", "|---|---|---|---|---|---|---|"]
    for r in sorted(rows[:30], key=lambda r: (r["start"], -r["mag"])):
        same = f" (+같은 움직임 {r['same']}개)" if r.get("same") else ""
        lines.append(f"| {r['el'][:48]} | {NAMES[r['prop']]} | {r['start']} | {r['end']} | {fmt(r['prop'], r['from'])} | {fmt(r['prop'], r['to'])} | {r['note']}{same} |")
    if idle:
        lines += ["", f"- 스크롤 없이 바뀐 것(인트로, 자동 재생) {len(idle)}건은 표에서 뺐다: " + ", ".join(sorted({r['el'][:30] for r in idle})[:6])]
    sh = sheet(shots, f"{a.out}_sheet.jpg", a.w)
    lines += ["", f"- 캡처 {len(shots)}장: " + ", ".join(Path(s[1]).name for s in shots) + (f" → 모아보기 {Path(sh).name}" if sh else "")]
    lines += ["- 읽는 법: '자리(고정·느리게)'가 '화면에 고정'이면 그 구간 동안 그 요소가 화면에 붙어 있다(고정 무대). 폭·높이·잘라내기가 바뀌면 띠가 커지는 장면, 투명도는 나타남·사라짐, 확대는 안쪽 사진 줌, 선 그리기는 스크롤 따라 그려지는 선이다."]
    Path(f"{a.out}.md").write_text("\n".join(lines), encoding="utf-8")
    json.dump({"url": a.url, "w": a.w, "h": a.h, "libs": libs, "scroll": scroll_kind, "labels": labels, "samples": samples, "rows": rows[:80]}, open(f"{a.out}.json", "w", encoding="utf-8"), ensure_ascii=False)
    print("\n".join(lines))


asyncio.run(main())
