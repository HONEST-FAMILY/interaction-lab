import argparse, asyncio, json
from playwright.async_api import async_playwright

JS = r"""() => {
  const vw = innerWidth, vh = innerHeight;
  const out = { texts: [], images: [], bg: null, chars: 0 };
  const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const t = node.textContent.replace(/\s+/g, ' ').trim();
    if (t.length < 2) continue;
    const el = node.parentElement;
    if (!el || !vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh || r.width < 4 || r.height < 4) continue;
    out.chars += t.length;
    if (seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    out.texts.push({ t: t.slice(0, 30), fs: parseFloat(cs.fontSize), fw: cs.fontWeight, lh: cs.lineHeight, ls: cs.letterSpacing, c: cs.color, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) });
  }
  document.querySelectorAll('img, video, canvas, picture, svg, [style*="background-image"], *').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const cs = getComputedStyle(el);
    const isMedia = ['img', 'video', 'canvas'].includes(tag) || (cs.backgroundImage && cs.backgroundImage !== 'none' && cs.backgroundImage.includes('url('));
    if (!isMedia || !vis(el)) return;
    const r = el.getBoundingClientRect();
    const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(vw, r.right), y1 = Math.min(vh, r.bottom);
    if (x1 - x0 < 40 || y1 - y0 < 40) return;
    out.images.push({ tag, x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0), radius: cs.borderRadius, shadow: cs.boxShadow !== 'none' ? cs.boxShadow.slice(0, 60) : '' });
  });
  const mid = document.elementFromPoint(vw / 2, vh / 2);
  for (let e = mid; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)') { out.bg = c; break; } }
  return out;
}"""


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--y", type=int, default=0)
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--out", required=True)
    ap.add_argument("--wait", type=int, default=2500)
    a = ap.parse_args()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": a.w, "height": a.h})
        await pg.goto(a.url, wait_until="networkidle", timeout=60000)
        await pg.wait_for_timeout(a.wait)
        step = 0
        while step < a.y:
            step = min(a.y, step + 700)
            await pg.evaluate(f"window.scrollTo(0,{step})")
            await pg.wait_for_timeout(120)
        await pg.wait_for_timeout(1400)
        data = await pg.evaluate(JS)
        await pg.screenshot(path=a.out + ".jpg", type="jpeg", quality=80)
        await b.close()
    texts = sorted(data["texts"], key=lambda d: -d["fs"])
    area = 0
    boxes = []
    for im in data["images"]:
        boxes.append((im["x"], im["y"], im["x"] + im["w"], im["y"] + im["h"]))
    grid = set()
    for x0, y0, x1, y1 in boxes:
        for gx in range(x0 // 20, x1 // 20):
            for gy in range(y0 // 20, y1 // 20):
                grid.add((gx, gy))
    area = len(grid) * 400 / (a.w * a.h) * 100
    chars = data["chars"]
    lines = [f"# 실측 {a.url} y={a.y} {a.w}x{a.h}", f"- 바탕색 {data['bg']} / 그림 면적 {area:.0f}% / 글 덩어리 {len(texts)}개 / 글자 약 {chars}자", "", "| 글자 | 크기 | 굵기 | 행간 | 자간 | 색 | x | 폭 |", "|---|---|---|---|---|---|---|---|"]
    for t in texts[:14]:
        lines.append(f"| {t['t']} | {t['fs']:.0f} | {t['fw']} | {t['lh']} | {t['ls']} | {t['c']} | {t['x']} | {t['w']} |")
    lines += ["", "| 그림 | x | y | 폭 | 높이 | 모서리 | 그림자 |", "|---|---|---|---|---|---|---|"]
    for im in sorted(data["images"], key=lambda d: -(d["w"] * d["h"]))[:8]:
        lines.append(f"| {im['tag']} | {im['x']} | {im['y']} | {im['w']} | {im['h']} | {im['radius']} | {im['shadow']} |")
    open(a.out + ".md", "w", encoding="utf-8").write("\n".join(lines))
    json.dump(data, open(a.out + ".json", "w", encoding="utf-8"), ensure_ascii=False)
    print("\n".join(lines[:4]))


asyncio.run(main())
