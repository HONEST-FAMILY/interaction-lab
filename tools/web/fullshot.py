import sys, asyncio, time
from playwright.async_api import async_playwright

async def shoot(url, out, width, height, steps):
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--enable-gpu","--use-angle=d3d11","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": width, "height": height})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append("console:"+m.type+":"+m.text) if m.type=="error" else None)
        await pg.goto(url, wait_until="networkidle", timeout=60000)
        await pg.wait_for_timeout(2500)
        total = await pg.evaluate("document.documentElement.scrollHeight")
        n = 0
        y = 0
        shots = []
        while y < total and n < steps:
            await pg.evaluate(f"window.scrollTo(0,{y})")
            await pg.wait_for_timeout(1300)
            f = f"{out}_{n:02d}.jpg"
            await pg.screenshot(path=f, type="jpeg", quality=70)
            shots.append(f)
            n += 1
            y += height
            total = await pg.evaluate("document.documentElement.scrollHeight")
        print("height", total, "shots", n)
        for e in errs[:10]:
            print("ERR", e)
        await b.close()

url, out = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 1440
h = int(sys.argv[4]) if len(sys.argv) > 4 else 900
steps = int(sys.argv[5]) if len(sys.argv) > 5 else 30
asyncio.run(shoot(url, out, w, h, steps))
