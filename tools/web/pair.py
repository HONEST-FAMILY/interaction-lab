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
    if len(sys.argv) < 6 or (len(sys.argv) - 2) % 4:
        sys.exit('usage: pair.py out.jpg "ref label" ref.jpg "our label" ours.jpg [...more groups of 4]')
    out = sys.argv[1]
    groups = [sys.argv[i:i + 4] for i in range(2, len(sys.argv), 4)]
    w = 900
    bar = 46
    f = font(24)
    rows = []
    for ref_label, ref_img, our_label, our_img in groups:
        pair = []
        for label, path in ((ref_label, ref_img), (our_label, our_img)):
            im = Image.open(path).convert("RGB")
            im = im.resize((w, int(im.height * w / im.width)))
            cell = Image.new("RGB", (w, im.height + bar), (17, 17, 17))
            cell.paste(im, (0, bar))
            ImageDraw.Draw(cell).text((14, 9), label, fill=(255, 255, 255), font=f)
            pair.append(cell)
        h = max(c.height for c in pair)
        row = Image.new("RGB", (w * 2 + 12, h), (255, 255, 255))
        row.paste(pair[0], (0, 0))
        row.paste(pair[1], (w + 12, 0))
        rows.append(row)
    total = sum(r.height for r in rows) + 12 * (len(rows) - 1)
    sheet = Image.new("RGB", (w * 2 + 12, total), (255, 255, 255))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 12
    sheet.save(out, quality=82)
    print(out, len(rows), "pairs")


if __name__ == "__main__":
    main()
