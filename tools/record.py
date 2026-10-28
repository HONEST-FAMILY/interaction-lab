import argparse
import asyncio
import base64
import subprocess
from pathlib import Path

from playwright.async_api import async_playwright

ARGS = [
    "--use-angle=d3d11",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
FFMPEG = "ffmpeg"
W, H = 1280, 800

RECIPES = {
    "type": [
        ("wait", 1.7),
        ("move", [(0.18, 0.62), (0.36, 0.42), (0.5, 0.58), (0.66, 0.4), (0.84, 0.6)], 1.3),
        ("hold", (0.5, 0.48), 1.5),
        ("wait", 1.3),
        ("tap", (0.5, 0.5)),
        ("wait", 1.8),
    ],
    "ink": [
        ("wait", 1.6),
        ("drag", [(0.18, 0.55), (0.4, 0.38), (0.58, 0.62), (0.82, 0.42)], 1.5),
        ("tap", (0.34, 0.3)),
        ("wait", 0.35),
        ("tap", (0.68, 0.72)),
        ("drag", [(0.78, 0.2), (0.5, 0.52), (0.26, 0.82)], 1.0),
        ("wait", 1.5),
    ],
    "strings": [
        ("wait", 1.5),
        ("drag", [(0.3, 0.12), (0.36, 0.88)], 0.7),
        ("wait", 0.5),
        ("drag", [(0.62, 0.88), (0.54, 0.12)], 0.45),
        ("wait", 0.4),
        ("drag", [(0.76, 0.15), (0.8, 0.85)], 0.3),
        ("wait", 1.8),
    ],
    "cloth": [
        ("wait", 1.9),
        ("drag", [(0.5, 0.52), (0.62, 0.72), (0.4, 0.74)], 1.4),
        ("wait", 1.1),
        ("drag", [(0.28, 0.32), (0.72, 0.62)], 0.15),
        ("wait", 2.0),
    ],
    "contour": [
        ("wait", 1.9),
        ("hold", (0.42, 0.5), 1.6),
        ("drag", [(0.6, 0.42), (0.76, 0.62)], 1.0),
        ("tap", (0.3, 0.7)),
        ("wait", 0.4),
        ("tap", (0.7, 0.3)),
        ("wait", 1.5),
    ],
    "drop": [
        ("wait", 4.2),
        ("tap", (0.3, 0.3)),
        ("wait", 0.25),
        ("tap", (0.62, 0.25)),
        ("wait", 1.4),
        ("click", ".drop-float"),
        ("wait", 2.4),
        ("click", ".drop-float"),
        ("wait", 1.8),
    ],
}


async def glide(page, pts, dur, pressed):
    n = max(2, int(dur / 0.016))
    if pressed:
        await page.mouse.move(pts[0][0] * W, pts[0][1] * H)
        await page.mouse.down()
    for i in range(n + 1):
        t = i / n
        seg = t * (len(pts) - 1)
        k = min(int(seg), len(pts) - 2)
        f = seg - k
        x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f
        y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f
        await page.mouse.move(x * W, y * H)
        await asyncio.sleep(0.016)
    if pressed:
        await page.mouse.up()


async def run(page, recipe):
    for step in recipe:
        kind = step[0]
        if kind == "wait":
            await asyncio.sleep(step[1])
        elif kind == "move":
            await glide(page, step[1], step[2], False)
        elif kind == "drag":
            await glide(page, step[1], step[2], True)
        elif kind == "hold":
            x, y = step[1]
            await page.mouse.move(x * W, y * H)
            await page.mouse.down()
            await asyncio.sleep(step[2])
            await page.mouse.up()
        elif kind == "tap":
            x, y = step[1]
            await page.mouse.move(x * W, y * H)
            await page.mouse.down()
            await asyncio.sleep(0.06)
            await page.mouse.up()
        elif kind == "click":
            await page.evaluate("s => document.querySelector(s).click()", step[1])


async def record(base, slug, out_dir, work):
    frames = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, channel="chrome", args=ARGS)
        ctx = await browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, user_agent=UA)
        page = await ctx.new_page()
        cdp = await ctx.new_cdp_session(page)

        async def on_frame(params):
            frames.append((params["metadata"]["timestamp"], params["data"]))
            try:
                await cdp.send("Page.screencastFrameAck", {"sessionId": params["sessionId"]})
            except Exception:
                pass

        cdp.on("Page.screencastFrame", lambda prm: asyncio.ensure_future(on_frame(prm)))
        await page.goto(f"{base}/{slug}/?rec=1", wait_until="domcontentloaded")
        await page.add_style_tag(content=".lab-ui,.lab-hint,.type-word{display:none!important}")
        await cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 90, "maxWidth": W, "maxHeight": H, "everyNthFrame": 1})
        await run(page, RECIPES[slug])
        await cdp.send("Page.stopScreencast")
        await asyncio.sleep(0.2)
        await browser.close()

    fdir = work / slug
    fdir.mkdir(parents=True, exist_ok=True)
    for old in fdir.glob("*.jpg"):
        old.unlink()
    frames.sort(key=lambda f: f[0])
    lines = []
    for i, (ts, data) in enumerate(frames):
        name = fdir / f"{i:05d}.jpg"
        name.write_bytes(base64.b64decode(data))
        nxt = frames[i + 1][0] if i + 1 < len(frames) else ts + 1 / 30
        lines.append(f"file '{name.as_posix()}'\nduration {max(0.001, nxt - ts):.4f}")
    lines.append(f"file '{(fdir / f'{len(frames) - 1:05d}.jpg').as_posix()}'")
    (fdir / "list.txt").write_text("\n".join(lines), encoding="utf-8")

    out_dir.mkdir(parents=True, exist_ok=True)
    mp4 = out_dir / f"{slug}.mp4"
    subprocess.run([
        FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(fdir / "list.txt"),
        "-vf", "fps=30,scale=960:600:flags=lanczos,format=yuv420p",
        "-c:v", "libx264", "-preset", "slow", "-crf", "29", "-movflags", "+faststart", "-an", str(mp4),
    ], check=True)
    span = frames[-1][0] - frames[0][0] if frames else 0
    return {"slug": slug, "frames": len(frames), "seconds": round(span, 2), "fps": round(len(frames) / span, 1) if span else 0, "mp4": str(mp4), "bytes": mp4.stat().st_size}


def poster(out_dir, slug, at):
    mp4 = out_dir / f"{slug}.mp4"
    jpg = out_dir / f"{slug}.jpg"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", str(at), "-i", str(mp4), "-frames:v", "1", "-q:v", "4", str(jpg)], check=True)
    return str(jpg)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs")
    ap.add_argument("--base", default="http://127.0.0.1:8458")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "previews"))
    ap.add_argument("--work", default=str(Path(__file__).resolve().parent.parent / ".rec"))
    ap.add_argument("--poster", type=float, default=-1)
    a = ap.parse_args()
    out_dir, work = Path(a.out), Path(a.work)
    for slug in a.slugs.split(","):
        info = await record(a.base, slug, out_dir, work)
        at = a.poster if a.poster >= 0 else info["seconds"] * 0.42
        info["poster"] = poster(out_dir, slug, at)
        print(info)


if __name__ == "__main__":
    asyncio.run(main())
