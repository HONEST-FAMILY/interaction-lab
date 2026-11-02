import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONTS = ["C:/Windows/Fonts/malgunbd.ttf", "C:/Windows/Fonts/malgun.ttf", "/System/Library/Fonts/AppleSDGothicNeo.ttc", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"]


def font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def main():
    if len(sys.argv) < 4 or (len(sys.argv) - 2) % 2:
        sys.exit("usage: trio.py out.jpg label1 img1 label2 img2 [label3 img3]")
    out = sys.argv[1]
    items = [(sys.argv[i], sys.argv[i + 1]) for i in range(2, len(sys.argv), 2)]
    col_w = 900
    bar = 46
    imgs = []
    for label, path in items:
        im = Image.open(path).convert("RGB")
        im = im.resize((col_w, round(im.height * col_w / im.width)), Image.LANCZOS)
        imgs.append((label, im))
    h = max(im.height for _, im in imgs) + bar
    sheet = Image.new("RGB", (col_w * len(imgs) + 12 * (len(imgs) - 1), h), (20, 20, 20))
    draw = ImageDraw.Draw(sheet)
    f = font(24)
    x = 0
    for label, im in imgs:
        sheet.paste(im, (x, bar))
        draw.text((x + 14, 9), label, fill=(255, 255, 255), font=f)
        x += col_w + 12
    sheet.save(out, quality=82)
    print(out, sheet.size)


main()
