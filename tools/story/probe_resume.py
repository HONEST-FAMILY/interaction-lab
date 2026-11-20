import asyncio
import json
import pathlib
import sys

from playwright.async_api import async_playwright

ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]

PROBE = """
() => {
  const st = document.getElementById('stage');
  const sr = st.getBoundingClientRect();
  const b = st.querySelector('.btn.primary');
  const r = b ? b.getBoundingClientRect() : null;
  return {over: st.scrollHeight - st.clientHeight, resume: b ? b.textContent : null,
          resumeBottom: r ? Math.round(r.bottom) : null, stageBottom: Math.round(sr.bottom),
          visible: r ? r.bottom <= sr.bottom + 1 : false,
          toc: getComputedStyle(st.querySelector('.start-toc') || document.body).display};
}
"""


async def main():
    target = pathlib.Path(sys.argv[1]).resolve()
    key = sys.argv[2]
    url = (target / "index.html").as_uri() if target.is_dir() else sys.argv[1]
    sizes = [tuple(int(v) for v in x.split("x")) for x in sys.argv[3].split(",")]
    out = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        for w, h in sizes:
            ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, has_touch=w < 700)
            page = await ctx.new_page()
            await page.goto(url)
            await page.evaluate("""(k) => {
              const D = JSON.parse(document.getElementById('deck-data').textContent);
              const refs = [];
              D.chapters.forEach((ch, ci) => ch.cards.forEach((c, j) => refs.push(c.id || ('c' + ci + '-' + j))));
              localStorage.setItem(k, JSON.stringify({v: 2, ref: refs[Math.floor(refs.length / 2)], a: {}, seen: {}, seenAns: {}}));
            }""", key)
            await page.goto(url.split("#")[0])
            await page.wait_for_timeout(600)
            r = await page.evaluate(PROBE)
            r["size"] = f"{w}x{h}"
            out.append(r)
            await ctx.close()
        await browser.close()
    sys.stdout.reconfigure(encoding="utf-8")
    for r in out:
        print(json.dumps(r, ensure_ascii=False))


asyncio.run(main())
