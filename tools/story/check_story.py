import asyncio
import json
import pathlib
import sys

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]

PROBE = """
() => {
  const st = document.getElementById('stage');
  const card = st.querySelector('.card');
  const vw = st.clientWidth;
  const wide = [];
  st.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    const sr = st.getBoundingClientRect();
    if (r.width > 0 && (r.right > sr.right + 1 || r.left < sr.left - 1)) wide.push(el.tagName + '.' + (el.className && el.className.baseVal === undefined ? el.className : ''));
  });
  const imgs = [...st.querySelectorAll('img')].map(i => ({src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0}));
  const title = (card.querySelector('.title,.q,h1,.chhead b') || {}).textContent || '';
  return {over: st.scrollHeight - st.clientHeight, wide: wide.slice(0, 5), imgs, title: title.slice(0, 40),
          label: document.getElementById('toplabel').textContent, next: document.getElementById('next').textContent,
          docW: document.documentElement.scrollWidth, winW: window.innerWidth};
}
"""


async def wait_fonts(page):
    try:
        await page.evaluate("document.fonts.ready.then(() => true)")
    except Exception:
        pass


async def run_size(browser, url, w, h, shots_dir, answer_mode):
    ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, has_touch=w < 700)
    page = await ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    await page.goto(url)
    await page.wait_for_selector(".card")
    await wait_fonts(page)
    await page.wait_for_timeout(400)
    n = await page.evaluate("JSON.parse(document.getElementById('deck-data').textContent).chapters.reduce((a,c)=>a+c.cards.length,0)")
    rows = []
    for i in range(n):
        await page.wait_for_timeout(330)
        opts = await page.query_selector_all(".opt")
        if opts and answer_mode:
            answer = await page.evaluate(f"(() => {{ const D = JSON.parse(document.getElementById('deck-data').textContent); const all = []; D.chapters.forEach(c => c.cards.forEach(x => all.push(x))); return all[{i}].answer; }})()")
            pick = answer if (i % 2 == 0) else (answer + 1) % len(opts)
            await opts[pick].click()
            await page.wait_for_timeout(200)
        info = await page.evaluate(PROBE)
        info["i"] = i + 1
        rows.append(info)
        if shots_dir:
            await page.screenshot(path=str(shots_dir / f"c{i + 1:02d}.png"))
        if i < n - 1:
            await page.click("#next")
    end_score = await page.evaluate("(document.querySelector('.score b')||{}).textContent || ''")
    await page.click("#menu")
    await page.wait_for_timeout(200)
    toc = await page.evaluate("document.querySelectorAll('#tocbox .toc li').length")
    sheet_open = await page.evaluate("!document.getElementById('sheet').hidden")
    await page.click("#closesheet")
    await page.goto(url.split('#')[0] + "#all")
    await page.reload()
    await page.wait_for_timeout(500)
    all_cards = await page.evaluate("document.querySelectorAll('.allwrap .card').length")
    all_wide = await page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    await ctx.close()
    return {"size": f"{w}x{h}", "cards": n, "rows": rows, "errors": errors, "end_score": end_score, "toc": toc,
            "sheet_open": sheet_open, "all_cards": all_cards, "all_wide": all_wide}


async def main():
    target = pathlib.Path(sys.argv[1]).resolve()
    out_json = pathlib.Path(sys.argv[2])
    shot_size = sys.argv[3] if len(sys.argv) > 3 else "412x640"
    sizes = [(412, 640), (416, 525), (360, 648), (444, 601), (870, 557), (1440, 900)]
    if len(sys.argv) > 4:
        sizes = [tuple(int(v) for v in x.split("x")) for x in sys.argv[4].split(",")]
    url = (target / "index.html").as_uri() if target.is_dir() else str(target)
    if sys.argv[1].startswith("http"):
        url = sys.argv[1]
    shots_root = out_json.parent / (out_json.stem + "_shots")
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        results = []
        for w, h in sizes:
            sd = None
            if f"{w}x{h}" == shot_size:
                sd = shots_root / f"{w}x{h}"
                sd.mkdir(parents=True, exist_ok=True)
            results.append(await run_size(browser, url, w, h, sd, answer_mode=True))
        await browser.close()
    out_json.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    for r in results:
        over = [(x["i"], x["over"]) for x in r["rows"] if x["over"] > 0]
        wide = [(x["i"], x["wide"]) for x in r["rows"] if x["wide"]]
        bad_img = [(x["i"], i["src"]) for x in r["rows"] for i in x["imgs"] if not i["ok"]]
        docw = [(x["i"], x["docW"], x["winW"]) for x in r["rows"] if x["docW"] > x["winW"]]
        print(f"{r['size']}: cards {r['cards']} over {len(over)} {over[:14]} wide {len(wide)} {wide[:3]} badimg {bad_img[:3]} docw {docw[:3]} errors {r['errors'][:3]} score {r['end_score']} toc {r['toc']} sheet {r['sheet_open']} all {r['all_cards']} allwide {r['all_wide']}")


asyncio.run(main())
