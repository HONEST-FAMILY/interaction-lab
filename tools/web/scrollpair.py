import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
FONTS = ["C:/Windows/Fonts/malgunbd.ttf", "C:/Windows/Fonts/malgun.ttf", "/System/Library/Fonts/AppleSDGothicNeo.ttc", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"]


def font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


async def open_page(b, url, w, h, wait):
    mobile = w < 760
    ctx = await b.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
    await pg.goto(url, wait_until="load", timeout=60000)
    await pg.wait_for_timeout(wait)
    await pg.mouse.move(w / 2, h / 2)
    return pg, errs


async def wheel_by(pg, dy):
    sent = 0
    while abs(dy - sent) >= 1:
        step = max(-50, min(50, dy - sent))
        await pg.mouse.wheel(0, step)
        sent += step
        await pg.wait_for_timeout(28)


async def scroll_to(pg, target, jump, settle):
    if jump:
        await pg.evaluate(f"window.scrollTo(0,{target})")
        await pg.wait_for_timeout(settle)
        return await pg.evaluate("Math.round(scrollY)")
    for _ in range(3):
        y = await pg.evaluate("Math.round(scrollY)")
        if abs(y - target) <= 6:
            break
        await wheel_by(pg, target - y)
        await pg.wait_for_timeout(max(700, settle // 2))
    y = await pg.evaluate("Math.round(scrollY)")
    if abs(y - target) > 30:
        await pg.evaluate(f"window.scrollTo(0,{target})")
    await pg.wait_for_timeout(settle)
    return await pg.evaluate("Math.round(scrollY)")


async def main():
    ap = argparse.ArgumentParser(description="레퍼런스와 우리 시안을 같은 스크롤 위치에서 찍어 '레퍼런스 | 우리'로 한 장에 붙인다. 첫 화면 스크롤 장면 판정용")
    ap.add_argument("out", help="결과 .jpg")
    ap.add_argument("ref")
    ap.add_argument("ours")
    ap.add_argument("--at", default="", help="스크롤 위치 px, 쉼표로. scrollprobe.py 표의 시작·끝 px를 넣는다 (기본: 화면 높이의 0, 0.35, 0.7, 1.05, 1.4, 2배)")
    ap.add_argument("--ours-at", default="", help="우리 쪽 위치를 따로 줄 때(장면 길이가 다를 때). 개수는 --at과 같게")
    ap.add_argument("--labels", nargs=2, default=["레퍼런스", "우리"])
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--wait", type=int, default=3500, help="처음 열고 기다리는 ms(인트로가 길면 늘린다)")
    ap.add_argument("--settle", type=int, default=1500, help="도착한 뒤 기다리는 ms(scrub 지연과 관성이 끝나게)")
    ap.add_argument("--jump", action="store_true", help="휠 대신 scrollTo")
    a = ap.parse_args()
    at = [int(x) for x in a.at.split(",") if x.strip()] or [int(a.h * k) for k in (0, 0.35, 0.7, 1.05, 1.4, 2)]
    ours_at = [int(x) for x in a.ours_at.split(",") if x.strip()] or at
    if len(ours_at) != len(at):
        raise SystemExit("--ours-at 개수가 --at과 다르다")
    order = sorted(range(len(at)), key=lambda k: at[k])
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    frames = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        (rp, rerr), (op, oerr) = await asyncio.gather(open_page(b, a.ref, a.w, a.h, a.wait), open_page(b, a.ours, a.w, a.h, a.wait))
        for k in order:
            ry, oy = await asyncio.gather(scroll_to(rp, at[k], a.jump, a.settle), scroll_to(op, ours_at[k], a.jump, a.settle))
            rpath, opath = out.with_name(f"{out.stem}_ref_{k:02d}.jpg"), out.with_name(f"{out.stem}_ours_{k:02d}.jpg")
            await rp.screenshot(path=str(rpath), type="jpeg", quality=80)
            await op.screenshot(path=str(opath), type="jpeg", quality=80)
            frames[k] = (ry, oy, rpath, opath)
        await b.close()
    cw = 720 if a.w >= 760 else 390
    bar, gap = 42, 10
    f, fs = font(22), font(18)
    rows = []
    for k in range(len(at)):
        ry, oy, rpath, opath = frames[k]
        cells = []
        for label, y, want, path in ((a.labels[0], ry, at[k], rpath), (a.labels[1], oy, ours_at[k], opath)):
            im = Image.open(path).convert("RGB")
            im = im.resize((cw, int(im.height * cw / im.width)))
            cell = Image.new("RGB", (cw, im.height + bar), (17, 17, 17))
            cell.paste(im, (0, bar))
            d = ImageDraw.Draw(cell)
            d.text((12, 8), label, fill=(255, 255, 255), font=f)
            note = f"{y}px" + ("" if abs(y - want) <= 30 else f" (목표 {want}px에 못 감)")
            tw = d.textlength(note, font=fs)
            d.text((cw - tw - 12, 11), note, fill=(255, 196, 110), font=fs)
            cells.append(cell)
        h = max(c.height for c in cells)
        row = Image.new("RGB", (cw * 2 + gap, h), (255, 255, 255))
        row.paste(cells[0], (0, 0))
        row.paste(cells[1], (cw + gap, 0))
        rows.append(row)
    total = sum(r.height for r in rows) + gap * (len(rows) - 1)
    sheet = Image.new("RGB", (cw * 2 + gap, total), (255, 255, 255))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + gap
    sheet.save(out, quality=82)
    print(out, f"{len(rows)}줄", "위치", ", ".join(f"{frames[k][0]}|{frames[k][1]}" for k in range(len(at))))
    if rerr or oerr:
        print("페이지 오류:", (rerr + oerr)[:3])


asyncio.run(main())
