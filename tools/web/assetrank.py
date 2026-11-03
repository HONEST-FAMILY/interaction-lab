import argparse
import asyncio
import csv
import hashlib
import io
import re
from pathlib import Path
from urllib.parse import urlparse, unquote

from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]
FONTS = ["C:/Windows/Fonts/malgunbd.ttf", "C:/Windows/Fonts/malgun.ttf", "/System/Library/Fonts/AppleSDGothicNeo.ttc", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"]

DOM_JS = r"""() => {
  const out = [];
  const abs = (u) => { try { return new URL(u.trim(), location.href).href; } catch (e) { return null; } };
  const box = (el) => { if (!el || !el.getBoundingClientRect) return 0; const r = el.getBoundingClientRect(); return Math.round(r.width); };
  const push = (u, how, el) => { if (!u) return; const a = abs(u); if (a && /^https?:/.test(a)) out.push([a, how, box(el)]); };
  const set = (v, how, el) => (v || '').split(',').forEach((s) => { const u = s.trim().split(/\s+/)[0]; if (u) push(u, how, el); });
  document.querySelectorAll('img').forEach((i) => {
    push(i.currentSrc || i.src, 'img', i);
    set(i.getAttribute('srcset'), 'srcset', i);
    ['data-src', 'data-original', 'data-lazy', 'data-lazy-src', 'data-bg', 'data-background', 'data-image'].forEach((k) => { const v = i.getAttribute(k); if (v) push(v, k, i); });
    set(i.getAttribute('data-srcset'), 'data-srcset', i);
  });
  document.querySelectorAll('source').forEach((s) => { set(s.getAttribute('srcset') || s.getAttribute('data-srcset'), 'source', s.parentElement); });
  document.querySelectorAll('body *').forEach((e) => {
    const bg = getComputedStyle(e).backgroundImage;
    if (bg && bg !== 'none') (bg.match(/url\((['"]?)(.*?)\1\)/g) || []).forEach((m) => push(m.replace(/^url\((['"]?)/, '').replace(/(['"]?)\)$/, ''), 'css-bg', e));
    ['data-bg', 'data-background', 'data-image', 'data-src'].forEach((k) => { const v = e.getAttribute(k); if (v && /\.(png|jpe?g|webp|avif|gif)(\?|$)/i.test(v)) push(v, k, e); });
  });
  document.querySelectorAll('video[poster]').forEach((v) => push(v.getAttribute('poster'), 'poster', v));
  document.querySelectorAll('link[rel~="preload"][as="image"], link[rel~="apple-touch-icon"]').forEach((l) => push(l.getAttribute('href'), 'preload', null));
  document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach((m) => push(m.getAttribute('content'), 'og', null));
  return out;
}"""


def font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def safe_name(url):
    name = unquote(Path(urlparse(url).path).name) or "image"
    name = re.sub(r"[^\w.\-가-힣]+", "_", name)
    return name[-60:]


def checker(w, h, s=12):
    im = Image.new("RGB", (w, h), (236, 236, 236))
    d = ImageDraw.Draw(im)
    for y in range(0, h, s):
        for x in range((y // s % 2) * s, w, s * 2):
            d.rectangle([x, y, x + s - 1, y + s - 1], fill=(250, 250, 250))
    return im


async def collect(ctx, url, steps):
    pg = await ctx.new_page()
    seen = []
    pg.on("response", lambda r: seen.append(r.url) if r.request.resource_type == "image" and r.status < 400 else None)
    await pg.goto(url, wait_until="load", timeout=60000)
    await pg.wait_for_timeout(2500)
    h = await pg.evaluate("document.documentElement.scrollHeight")
    vh = await pg.evaluate("innerHeight")
    y = 0
    for _ in range(steps):
        y += int(vh * 0.8)
        await pg.evaluate(f"window.scrollTo(0,{y})")
        await pg.wait_for_timeout(260)
        if y > h:
            h = await pg.evaluate("document.documentElement.scrollHeight")
            if y > h:
                break
    await pg.wait_for_timeout(1200)
    dom = await pg.evaluate(DOM_JS)
    await pg.close()
    found = {}
    for u in seen:
        if u.startswith("http"):
            found.setdefault(u, {"how": set(), "shown": 0})["how"].add("loaded")
    for u, how, shown in dom:
        e = found.setdefault(u, {"how": set(), "shown": 0})
        e["how"].add(how)
        e["shown"] = max(e["shown"], shown)
    return found


async def main():
    ap = argparse.ArgumentParser(description="고객 사이트 그림을 모두 받아 큰 순서로 줄 세우고 모아 보기 한 장을 만든다. 제품·사진의 가장 큰 원본 찾기용")
    ap.add_argument("urls", nargs="+", help="고객 사이트 주소(메인과 제품 페이지 등 여러 개 가능)")
    ap.add_argument("--out", required=True, help="출력 폴더 (files/, assets.csv, sheet.jpg)")
    ap.add_argument("--top", type=int, default=40, help="모아 보기에 넣을 장수")
    ap.add_argument("--min", type=int, default=200, help="모아 보기에 넣을 최소 긴 변 px")
    ap.add_argument("--steps", type=int, default=40, help="한 페이지에서 끝까지 내릴 때 최대 화면 수")
    ap.add_argument("--mobile", action="store_true", help="폰(390x844)으로도 한 번 더 열어 폰 전용 그림까지 받는다")
    a = ap.parse_args()
    out = Path(a.out)
    (out / "files").mkdir(parents=True, exist_ok=True)
    found, items, hashes = {}, [], {}
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        views = [({"width": 1440, "height": 900}, False)] + ([({"width": 390, "height": 844}, True)] if a.mobile else [])
        for vp, mob in views:
            ctx = await b.new_context(viewport=vp, is_mobile=mob, has_touch=mob, device_scale_factor=2 if mob else 1)
            for u in a.urls:
                try:
                    got = await collect(ctx, u, a.steps)
                except Exception as e:
                    print("열기 실패", u, str(e)[:120])
                    continue
                for k, v in got.items():
                    e = found.setdefault(k, {"how": set(), "shown": 0, "pages": set()})
                    e["how"] |= v["how"]
                    e["shown"] = max(e["shown"], v["shown"])
                    e["pages"].add(u + (" (폰)" if mob else ""))
            req = ctx.request
            for url, e in found.items():
                if "data" in e:
                    continue
                try:
                    r = await req.get(url, timeout=25000, headers={"Referer": a.urls[0]})
                    if not r.ok:
                        continue
                    body = await r.body()
                except Exception:
                    continue
                e["data"] = True
                if len(body) < 800:
                    continue
                ctype = (r.headers.get("content-type") or "").lower()
                hsh = hashlib.sha1(body).hexdigest()
                if hsh in hashes:
                    hashes[hsh]["urls"].append(url)
                    continue
                if "svg" in ctype or url.lower().split("?")[0].endswith(".svg"):
                    item = {"url": url, "urls": [url], "w": 0, "h": 0, "kb": len(body) // 1024, "kind": "svg", "alpha": True, "body": body, "e": e}
                else:
                    try:
                        im = Image.open(io.BytesIO(body))
                        im.load()
                    except Exception:
                        continue
                    alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
                    item = {"url": url, "urls": [url], "w": im.width, "h": im.height, "kb": len(body) // 1024, "kind": (im.format or "img").lower(), "alpha": alpha, "body": body, "e": e}
                hashes[hsh] = item
                items.append(item)
            await ctx.close()
        await b.close()
    items.sort(key=lambda it: -(it["w"] * it["h"]))
    rows = []
    for rank, it in enumerate(items, 1):
        ext = {"jpeg": "jpg", "png": "png", "webp": "webp", "gif": "gif", "svg": "svg", "avif": "avif"}.get(it["kind"], "img")
        base = Path(safe_name(it["url"])).stem
        fname = f"{rank:03d}_{it['w']}x{it['h']}_{base}.{ext}"
        (out / "files" / fname).write_bytes(it["body"])
        it["file"] = fname
        shown = it["e"]["shown"]
        note = ""
        if shown and it["w"] and it["w"] >= shown * 2 and it["w"] >= 400:
            note = f"원본이 표시 폭({shown}px)보다 {it['w'] / shown:.1f}배 큼"
        rows.append([rank, it["w"], it["h"], it["kb"], "투명" if it["alpha"] else "", it["kind"], shown or "", " ".join(sorted(it["e"]["how"])), note, it["url"], " | ".join(it["urls"][1:3]), " | ".join(sorted(it["e"]["pages"]))])
    with open(out / "assets.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["순위", "폭", "높이", "KB", "투명", "형식", "화면 표시 폭", "어디서", "메모", "주소", "같은 그림 다른 주소", "페이지"])
        w.writerows(rows)
    pick = [it for it in items if it["kind"] != "svg" and max(it["w"], it["h"]) >= a.min][: a.top]
    cw, ch, lab, cols = 300, 220, 46, 5
    f1, f2 = font(15), font(13)
    sheet = None
    if pick:
        nrows = (len(pick) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cw + (cols - 1) * 8, nrows * (ch + lab) + (nrows - 1) * 8), (255, 255, 255))
        for k, it in enumerate(pick):
            im = Image.open(io.BytesIO(it["body"]))
            im = im.convert("RGBA")
            im.thumbnail((cw - 10, ch - 10))
            cell = checker(cw, ch) if it["alpha"] else Image.new("RGB", (cw, ch), (24, 24, 24))
            cell.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2), im)
            x, y = (k % cols) * (cw + 8), (k // cols) * (ch + lab + 8)
            sheet.paste(cell, (x, y))
            d = ImageDraw.Draw(sheet)
            rank = items.index(it) + 1
            d.text((x + 4, y + ch + 3), f"#{rank}  {it['w']}x{it['h']}  {it['kb']}KB{'  투명' if it['alpha'] else ''}", fill=(17, 17, 17), font=f1)
            d.text((x + 4, y + ch + 24), it["file"][-40:], fill=(110, 110, 110), font=f2)
        sheet.save(out / "sheet.jpg", quality=82)
    print(f"그림 {len(items)}개 (svg {sum(1 for i in items if i['kind'] == 'svg')}개) → {out / 'assets.csv'}, 파일 {out / 'files'}" + (f", 모아 보기 {out / 'sheet.jpg'} ({len(pick)}장)" if sheet else ""))
    for r in rows[:15]:
        print(f"#{r[0]:>3} {r[1]}x{r[2]} {r[3]}KB {r[4]} {r[8]} {r[9][-70:]}")


asyncio.run(main())
