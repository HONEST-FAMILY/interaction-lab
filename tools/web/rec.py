import sys, asyncio, base64, json, time, io
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw

ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]

async def main(url, out, w, h, script_path, seconds):
    steps = json.load(open(script_path, encoding="utf-8")) if script_path != "-" else []
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        mobile = w < 760
        ctx = await b.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        cdp = await ctx.new_cdp_session(pg)
        frames = []
        t0 = [None]
        def on_frame(ev):
            if t0[0] is None:
                t0[0] = time.time()
            frames.append((time.time() - t0[0], ev["data"]))
            asyncio.ensure_future(cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]}))
        cdp.on("Page.screencastFrame", on_frame)
        await pg.goto(url, wait_until="load")
        await cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 60, "everyNthFrame": 1, "maxWidth": w, "maxHeight": h})
        start = time.time()
        for s in steps:
            k = s[0]
            if k == "wait": await pg.wait_for_timeout(s[1])
            elif k == "scroll": await pg.mouse.wheel(0, s[1])
            elif k == "scrollTo": await pg.evaluate(f"window.scrollTo(0,{s[1]})")
            elif k == "sel": await pg.evaluate(f"document.querySelector({json.dumps(s[1])}).scrollIntoView({{block:'start'}})")
            elif k == "move": await pg.mouse.move(s[1], s[2], steps=s[3] if len(s) > 3 else 10)
            elif k == "down": await pg.mouse.down()
            elif k == "up": await pg.mouse.up()
            elif k == "click": await pg.mouse.click(s[1], s[2])
            elif k == "js": await pg.evaluate(s[1])
        rest = seconds - (time.time() - start)
        if rest > 0:
            await pg.wait_for_timeout(int(rest * 1000))
        await cdp.send("Page.stopScreencast")
        await b.close()
    if not frames:
        print("no frames"); return
    want = int(sys.argv[7]) if len(sys.argv) > 7 else 24
    span = frames[-1][0]
    picks = []
    for i in range(want):
        t = span * i / max(1, want - 1)
        best = min(frames, key=lambda f: abs(f[0] - t))
        picks.append(best)
    tw = 360 if w >= 760 else 200
    ims = []
    for t, d in picks:
        im = Image.open(io.BytesIO(base64.b64decode(d))).convert("RGB")
        r = tw / im.width
        im = im.resize((tw, int(im.height * r)))
        dr = ImageDraw.Draw(im)
        dr.rectangle((0, 0, 64, 16), fill=(0, 0, 0))
        dr.text((4, 2), f"{t:5.2f}s", fill=(255, 255, 0))
        ims.append(im)
    cols = 6 if w >= 760 else 8
    rows = (len(ims) + cols - 1) // cols
    th = ims[0].height
    S = Image.new("RGB", (cols * tw + (cols - 1) * 6, rows * th + (rows - 1) * 6), (255, 0, 255))
    for i, im in enumerate(ims):
        S.paste(im, ((i % cols) * (tw + 6), (i // cols) * (th + 6)))
    S.save(out, quality=72)
    print(out, "frames", len(frames), "span", round(span, 2), "fps~", round(len(frames) / max(span, 0.01), 1))
    for e in errs[:8]:
        print("ERR", e)

asyncio.run(main(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], float(sys.argv[6])))
