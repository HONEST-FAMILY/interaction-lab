import argparse
import asyncio
import json
import math
import time
from pathlib import Path

from playwright.async_api import async_playwright

ARGS = [
    "--use-angle=d3d11",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
]
UA_DESK = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
UA_MOB = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36"

FPS_JS = """() => new Promise(r => {
  const t = []; let last = performance.now();
  function f(now) {
    t.push(now - last); last = now;
    if (t.length < 121) requestAnimationFrame(f);
    else { t.shift(); const avg = t.reduce((a, b) => a + b, 0) / t.length;
      r({ avgMs: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), longFrames: t.filter(x => x > 25).length }); }
  }
  requestAnimationFrame(f);
})"""


class Pointer:
    def __init__(self, page, mobile, cdp):
        self.page = page
        self.mobile = mobile
        self.cdp = cdp

    async def down(self, x, y):
        if self.mobile:
            await self.cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 1}]})
        else:
            await self.page.mouse.move(x, y)
            await self.page.mouse.down()

    async def move(self, x, y, pressed=True):
        if self.mobile:
            if pressed:
                await self.cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y, "id": 1}]})
        else:
            await self.page.mouse.move(x, y)

    async def up(self):
        if self.mobile:
            await self.cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        else:
            await self.page.mouse.up()


async def path(ptr, pts, dur, pressed):
    n = max(2, int(dur / 0.016))
    for i in range(n + 1):
        t = i / n
        seg = t * (len(pts) - 1)
        k = min(int(seg), len(pts) - 2)
        f = seg - k
        x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f
        y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f
        await ptr.move(x, y, pressed)
        await asyncio.sleep(0.016)


async def gesture(ptr, name, w, h):
    cx, cy = w / 2, h / 2
    if name == "circle":
        r = min(w, h) * 0.28
        pts = [(cx + r * math.cos(a / 24 * math.tau), cy + r * math.sin(a / 24 * math.tau)) for a in range(25)]
        if ptr.mobile:
            await ptr.down(*pts[0])
            await path(ptr, pts, 1.4, True)
            await ptr.up()
        else:
            await path(ptr, pts, 1.4, False)
    elif name == "swipe":
        pts = [(w * 0.1, cy), (w * 0.9, cy)]
        await ptr.down(*pts[0])
        await path(ptr, pts, 0.6, True)
        await ptr.up()
    elif name == "vswipe":
        pts = [(cx, h * 0.12), (cx, h * 0.88)]
        await ptr.down(*pts[0])
        await path(ptr, pts, 0.6, True)
        await ptr.up()
    elif name == "drag":
        pts = [(cx, cy - h * 0.1), (cx + w * 0.18, cy + h * 0.22)]
        await ptr.down(*pts[0])
        await path(ptr, pts, 0.7, True)
        await asyncio.sleep(0.25)
        await ptr.up()
    elif name == "slash":
        pts = [(w * 0.2, h * 0.25), (w * 0.8, h * 0.6)]
        await ptr.down(*pts[0])
        await path(ptr, pts, 0.18, True)
        await ptr.up()
    elif name == "hold":
        await ptr.down(cx, cy)
        await asyncio.sleep(1.2)
        await ptr.up()
    elif name == "tap":
        await ptr.down(cx, cy)
        await asyncio.sleep(0.06)
        await ptr.up()
    elif name == "wait":
        await asyncio.sleep(1.0)


def contact_sheet(files, out):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None
    imgs = [Image.open(f) for f in files]
    if not imgs:
        return None
    tw = 480
    th = int(imgs[0].height * tw / imgs[0].width)
    cols = 4 if imgs[0].width > imgs[0].height else 6
    if imgs[0].width <= imgs[0].height:
        tw = 260
        th = int(imgs[0].height * tw / imgs[0].width)
    rows = math.ceil(len(imgs) / cols)
    sheet = Image.new("RGB", (cols * tw, rows * (th + 22)), "white")
    d = ImageDraw.Draw(sheet)
    for i, (im, f) in enumerate(zip(imgs, files)):
        x, y = (i % cols) * tw, (i // cols) * (th + 22)
        sheet.paste(im.convert("RGB").resize((tw, th)), (x, y + 22))
        d.text((x + 4, y + 4), Path(f).stem, fill="black")
    sheet.save(out)
    return str(out)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--mobile", action="store_true")
    ap.add_argument("--out", default="qa_out")
    ap.add_argument("--gestures", default="circle,tap,drag")
    ap.add_argument("--intro", type=float, default=2.0)
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()

    errors, failed = [], []
    shots = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, channel="chrome", args=ARGS)
        ctx = await browser.new_context(
            viewport={"width": a.w, "height": a.h},
            device_scale_factor=2 if a.mobile else 1,
            is_mobile=a.mobile,
            has_touch=a.mobile,
            user_agent=UA_MOB if a.mobile else UA_DESK,
        )
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("requestfailed", lambda r: failed.append(f"{r.url} {r.failure}"))
        page.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)
        cdp = await ctx.new_cdp_session(page)
        ptr = Pointer(page, a.mobile, cdp)

        t0 = time.time()
        await page.goto(a.url, wait_until="load")

        async def snap(label):
            f = out / f"{len(shots):02d}_{label}.png"
            await page.screenshot(path=str(f))
            shots.append(str(f))

        await asyncio.sleep(0.35)
        await snap("t0.35")
        await asyncio.sleep(max(0.0, a.intro * 0.5 - 0.35))
        await snap(f"t{a.intro * 0.5:.1f}")
        await asyncio.sleep(a.intro * 0.5)
        await snap(f"t{a.intro:.1f}")
        fps_idle = await page.evaluate(FPS_JS)

        gs = [g for g in a.gestures.split(",") if g]
        for g in gs:
            task = asyncio.create_task(gesture(ptr, g, a.w, a.h))
            await asyncio.sleep(0.3)
            await snap(f"{g}-mid")
            await task
            await asyncio.sleep(0.15)
            await snap(f"{g}-after")
            await asyncio.sleep(0.9)
            await snap(f"{g}-settle")

        fps_after = await page.evaluate(FPS_JS)
        overflow = await page.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})")
        await browser.close()

    sheet = contact_sheet(shots, out / "sheet.png")
    print(json.dumps({
        "url": a.url, "viewport": f"{a.w}x{a.h}{' mobile' if a.mobile else ''}",
        "fps_idle": fps_idle, "fps_after": fps_after, "overflow": overflow,
        "errors": errors[:20], "failed": [f for f in failed if "favicon" not in f][:20],
        "sheet": sheet, "elapsed": round(time.time() - t0, 1),
    }, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    asyncio.run(main())
