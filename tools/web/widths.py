import argparse
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
UA_DESK = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
UA_MOB = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36"

OVERLAP_JS = """() => {
  const out = [];
  const els = [...document.querySelectorAll('h1,h2,p,b,small,strong,a,button,span,li')].filter(e => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && e.children.length === 0 && e.textContent.trim();
  });
  for (const e of els) {
    const r = e.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.left < -1) out.push('밖으로 나감: ' + e.textContent.trim().slice(0, 20));
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cy < 0 || cy > innerHeight) continue;
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== e && !e.contains(top) && !top.contains(e) && top.tagName !== 'CANVAS' && !top.closest('[data-qa-skip]') && !e.closest('[data-qa-skip]')) out.push('가려짐: ' + e.textContent.trim().slice(0, 20) + ' ← ' + (top.className || top.tagName));
  }
  return out.slice(0, 12);
}"""


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--out", default="qa_pages")
    ap.add_argument("--widths", default="390,412,768,980,1024,1280,1440,1920,2560")
    ap.add_argument("--shots", action="store_true")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    report = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, channel="chrome", args=ARGS)
        for w in [int(x) for x in a.widths.split(",")]:
            mobile = w < 760
            h = 844 if mobile else (1366 if w == 1024 else (1080 if w == 1920 else (1440 if w == 2560 else 900)))
            ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1,
                                            is_mobile=mobile, has_touch=mobile, user_agent=UA_MOB if mobile else UA_DESK)
            page = await ctx.new_page()
            errs = []
            page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("response", lambda r: errs.append(f"{r.status} {r.url}") if r.status >= 400 else None)
            await page.goto(a.url, wait_until="load")
            await asyncio.sleep(1.6)
            issues = []
            total = await page.evaluate("() => document.documentElement.scrollHeight")
            y, i = 0, 0
            while y < total:
                await page.evaluate(f"window.scrollTo(0,{y})")
                await asyncio.sleep(0.9)
                issues += await page.evaluate(OVERLAP_JS)
                if a.shots:
                    await page.screenshot(path=str(out / f"w{w}_{i:02d}.png"))
                y += int(h * 0.85)
                i += 1
                total = await page.evaluate("() => document.documentElement.scrollHeight")
            if False:
                await page.evaluate("document.querySelector('#list').scrollIntoView()")
                await asyncio.sleep(0.6)
                row = page.locator(".ix-row").nth(1)
                box = await row.bounding_box()
                if box:
                    await page.mouse.move(box["x"] + box["width"] * 0.45, box["y"] + box["height"] / 2, steps=12)
                    await asyncio.sleep(1.4)
                    await page.screenshot(path=str(out / f"w{w}_hover.png"))
            ov = await page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            report[w] = {"overflowX": ov, "issues": sorted(set(issues))[:10], "errors": [e for e in errs if "favicon" not in e][:6]}
            await ctx.close()
        await browser.close()
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    asyncio.run(main())
