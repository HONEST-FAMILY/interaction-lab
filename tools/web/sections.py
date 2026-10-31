import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"]

JS = r"""() => {
  const W = innerWidth, VH = innerHeight;
  const pageY = (r) => r.top + scrollY;
  let secs = [...document.querySelectorAll('section, footer, [class*="section"], main > div')]
    .filter(e => {
      const r = e.getBoundingClientRect();
      if (r.width < W * 0.85 || r.height < 160) return false;
      let p = e.parentElement;
      while (p && p !== document.body) {
        if (p.matches('section, footer, [class*="section"], main > div')) {
          const pr = p.getBoundingClientRect();
          if (pr.width >= W * 0.85 && pr.height >= 160) return false;
        }
        p = p.parentElement;
      }
      return true;
    });
  secs.sort((a, b) => pageY(a.getBoundingClientRect()) - pageY(b.getBoundingClientRect()));
  const out = [];
  for (const s of secs) {
    const sr = s.getBoundingClientRect();
    const area = sr.width * sr.height;
    const els = [...s.querySelectorAll('*')];
    let imgArea = 0;
    const radii = new Set();
    let cardLike = 0;
    const sizes = {};
    let maxFont = 0, headEl = null;
    let smallLabels = 0;
    let chars = 0;
    let boxes = [];
    const secBg = getComputedStyle(s).backgroundColor;
    for (const e of els) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const tag = e.tagName;
      const bgImg = cs.backgroundImage && cs.backgroundImage.includes('url(');
      if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'PICTURE' || bgImg) {
        const x0 = Math.max(r.left, sr.left), x1 = Math.min(r.right, sr.right);
        const y0 = Math.max(r.top, sr.top), y1 = Math.min(r.bottom, sr.bottom);
        if (x1 > x0 && y1 > y0) imgArea += (x1 - x0) * (y1 - y0);
      }
      const rad = parseFloat(cs.borderTopLeftRadius) || 0;
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const hasBg = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== secBg;
      if (rad >= 4 && r.width >= 120 && r.width <= W * 0.6 && r.height >= 80 && (bw > 0 || hasBg || cs.boxShadow !== 'none')) {
        radii.add(Math.round(rad));
        boxes.push([Math.round(r.width / 10), Math.round(r.height / 10)]);
      }
      const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
      if (own) {
        const fs = parseFloat(cs.fontSize);
        chars += own.length;
        const k = Math.round(fs);
        sizes[k] = (sizes[k] || 0) + own.length;
        if (fs > maxFont) { maxFont = fs; headEl = e; }
        if (fs <= 14 && own.length <= 24 && (cs.textTransform === 'uppercase' || parseFloat(cs.letterSpacing) > 0.5 || /^[A-Z0-9 ·\-—/&]+$/.test(own))) smallLabels++;
      }
    }
    const grp = {};
    for (const b of boxes) { const k = b.join('x'); grp[k] = (grp[k] || 0) + 1; }
    const grid = Object.values(grp).filter(n => n >= 3).reduce((a, b) => a + b, 0);
    const body = Object.entries(sizes).sort((a, b) => b[1] - a[1])[0];
    out.push({
      y: Math.round(pageY(sr)), h: Math.round(sr.height),
      img: +(imgArea / area).toFixed(2),
      cards: boxes.length, gridCards: grid, radii: [...radii].sort((a, b) => a - b),
      head: Math.round(maxFont), headText: headEl ? headEl.textContent.trim().slice(0, 24) : '',
      labels: smallLabels, body: body ? +body[0] : 0, chars,
      bg: secBg,
    });
  }
  return { W, VH, H: document.documentElement.scrollHeight, secs: out };
}"""


async def run(urls, out):
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        for name, url in urls:
            pg = await b.new_page(viewport={"width": 1440, "height": 900})
            try:
                await pg.goto(url, wait_until="load", timeout=60000)
                await pg.wait_for_timeout(2500)
                h = await pg.evaluate("document.documentElement.scrollHeight")
                y = 0
                while y < h:
                    await pg.evaluate(f"window.scrollTo(0,{y})")
                    await pg.wait_for_timeout(350)
                    y += 700
                    h = await pg.evaluate("document.documentElement.scrollHeight")
                await pg.evaluate("window.scrollTo(0,0)")
                await pg.wait_for_timeout(800)
                res[name] = await pg.evaluate(JS)
                res[name]["url"] = url
                print(name, "sections", len(res[name]["secs"]), "height", res[name]["H"])
            except Exception as e:
                res[name] = {"error": str(e)[:200], "url": url}
                print(name, "ERROR", str(e)[:120])
            await pg.close()
        await b.close()
    Path(out).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")


def summary(path):
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    for name, v in d.items():
        secs = [x for x in v.get("secs", []) if x["y"] >= 850 and x["h"] >= 300]
        if not secs:
            print(name, "no sections below the first screen")
            continue
        h = sum(x["h"] for x in secs)
        chars = sum(x["chars"] for x in secs) / h * 900
        img = sum(x["img"] * x["h"] for x in secs) / h
        heads = [x["head"] for x in secs]
        same = max(heads.count(k) for k in set(heads))
        ok = img >= 0.40 and chars <= 220
        print(f"{name}: below-hero visual {img * 100:.0f}% (gate 40%+), text {chars:.0f} chars per screen (gate ~200), heading sizes {heads}, same size {same}/{len(heads)} -> {'PASS' if ok else 'FAIL'}")


if __name__ == "__main__":
    if sys.argv[1] == "--summary":
        summary(sys.argv[2])
    else:
        spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        asyncio.run(run(spec, sys.argv[2]))
        summary(sys.argv[2])
