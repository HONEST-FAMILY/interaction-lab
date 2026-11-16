import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.stdout.reconfigure(encoding='utf-8')

model, src_dir, out_dir, sheet_path = sys.argv[1:5]
extra = json.loads(Path(sys.argv[5]).read_text(encoding='utf-8')) if len(sys.argv) > 5 and Path(sys.argv[5]).exists() else {}
src, out = Path(src_dir), Path(out_dir)
out.mkdir(parents=True, exist_ok=True)


def detect(rgb):
    h, w = rgb.shape[:2]
    found = []
    for scale in (1.0, 2.0, 3.0):
        sw, sh = int(w * scale), int(h * scale)
        if max(sw, sh) > 4200:
            continue
        img = cv2.resize(rgb, (sw, sh), interpolation=cv2.INTER_CUBIC) if scale != 1.0 else rgb
        bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        det = cv2.FaceDetectorYN.create(model, '', (sw, sh), 0.45, 0.3, 5000)
        _, faces = det.detect(bgr)
        if faces is None:
            continue
        for f in faces:
            x, y, fw, fh, score = f[0] / scale, f[1] / scale, f[2] / scale, f[3] / scale, float(f[-1])
            found.append([x, y, x + fw, y + fh, score])
    merged = []
    for b in sorted(found, key=lambda b: -b[4]):
        keep = True
        for m in merged:
            ix = max(0, min(b[2], m[2]) - max(b[0], m[0]))
            iy = max(0, min(b[3], m[3]) - max(b[1], m[1]))
            inter = ix * iy
            area = min((b[2] - b[0]) * (b[3] - b[1]), (m[2] - m[0]) * (m[3] - m[1]))
            if area > 0 and inter / area > 0.3:
                keep = False
                break
        if keep:
            merged.append(b)
    return merged


def blur_region(im, box, pad):
    x1, y1, x2, y2 = box[:4]
    w, h = x2 - x1, y2 - y1
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    rx, ry = w / 2 + w * pad, h / 2 + h * pad
    X1, Y1, X2, Y2 = int(max(0, cx - rx)), int(max(0, cy - ry)), int(min(im.width, cx + rx)), int(min(im.height, cy + ry))
    if X2 <= X1 or Y2 <= Y1:
        return
    r = max(6, int(max(w, h) * 0.22))
    region = im.crop((X1, Y1, X2, Y2))
    if region.mode == 'RGBA':
        a = np.asarray(region).astype(np.float32) / 255.0
        pm = a.copy()
        pm[..., :3] *= pm[..., 3:4]
        pm_img = Image.fromarray((pm * 255).astype(np.uint8), 'RGBA')
        bl = np.asarray(pm_img.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255.0
        alpha = a[..., 3:4]
        rgb = np.where(bl[..., 3:4] > 1e-3, bl[..., :3] / np.maximum(bl[..., 3:4], 1e-3), a[..., :3])
        res = np.concatenate([np.clip(rgb, 0, 1), alpha], axis=-1)
        blurred = Image.fromarray((res * 255).astype(np.uint8), 'RGBA')
    else:
        blurred = region.filter(ImageFilter.GaussianBlur(r))
    mask = Image.new('L', region.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, region.width - 1, region.height - 1), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(2, int(min(region.size) * 0.08))))
    im.paste(Image.composite(blurred, region, mask), (X1, Y1))


report = {}
thumbs = []
for p in sorted(src.iterdir()):
    if p.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.webp'):
        continue
    im = Image.open(p)
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') and 'A' in im.getbands() or im.mode == 'RGBA' else im.convert('RGB')
    rgb = np.asarray(im.convert('RGB'))
    faces = detect(rgb)
    boxes = [b[:4] + [round(b[4], 3)] for b in faces] + [list(b) + [1.0] for b in extra.get(p.name, [])]
    for b in boxes:
        blur_region(im, b, 0.45)
    dst = out / p.name
    if p.suffix.lower() == '.webp':
        im.save(dst, 'WEBP', quality=90, method=6)
    elif p.suffix.lower() == '.png':
        im.save(dst, 'PNG', optimize=True)
    else:
        im.convert('RGB').save(dst, 'JPEG', quality=90, optimize=True, progressive=True)
    report[p.name] = [[round(float(v), 1) for v in b[:4]] + [float(b[4])] for b in boxes]
    vis = Image.open(dst).convert('RGB')
    d = ImageDraw.Draw(vis)
    for b in boxes:
        d.rectangle(b[:4], outline=(255, 0, 0), width=max(2, vis.width // 300))
    vis.thumbnail((420, 420))
    thumbs.append((p.name, len(boxes), vis))
    print(p.name, im.size, 'faces', len(boxes))

cols = 4
cw, ch = 430, 450
rows = (len(thumbs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cw, rows * ch), 'white')
dr = ImageDraw.Draw(sheet)
for i, (n, k, t) in enumerate(thumbs):
    x, y = (i % cols) * cw, (i // cols) * ch
    sheet.paste(t, (x + 5, y + 5))
    dr.text((x + 6, y + ch - 22), f'{n}  boxes={k}', fill='black')
sheet.save(sheet_path, quality=82)
Path(out_dir, '_faces.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
print('sheet', sheet_path)
