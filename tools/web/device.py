import argparse
import numpy as np
from PIL import Image, ImageFilter

p = argparse.ArgumentParser()
p.add_argument("--render", required=True)
p.add_argument("--screen", required=True)
p.add_argument("--out", required=True)
p.add_argument("--inset", type=float, default=-0.025)
p.add_argument("--glass", type=float, default=0.05)
p.add_argument("--max", type=int, default=0)
p.add_argument("--keep-green", action="store_true")
a = p.parse_args()

render = Image.open(a.render).convert("RGB")
if a.max and max(render.size) > a.max:
    scale = a.max / max(render.size)
    render = render.resize((round(render.width * scale), round(render.height * scale)), Image.LANCZOS)
arr = np.asarray(render).astype(np.int32)
r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
green = (g > 120) & (g - np.maximum(r, b) > 60)
mask_img = Image.fromarray((green * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
mask = np.asarray(mask_img) > 127
ys, xs = np.nonzero(mask)
if len(xs) < 500:
    raise SystemExit("green screen not found")

s = xs + ys
d = xs - ys
tl = (xs[s.argmin()], ys[s.argmin()])
br = (xs[s.argmax()], ys[s.argmax()])
tr = (xs[d.argmax()], ys[d.argmax()])
bl = (xs[d.argmin()], ys[d.argmin()])
quad = np.array([tl, tr, br, bl], dtype=np.float64)
if a.inset:
    center = quad.mean(axis=0)
    quad = center + (quad - center) * (1 - a.inset)

screen = Image.open(a.screen).convert("RGB")
sw, sh = screen.size
src = np.array([(0, 0), (sw, 0), (sw, sh), (0, sh)], dtype=np.float64)

rows, rhs = [], []
for (x, y), (u, v) in zip(quad, src):
    rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); rhs.append(u)
    rows.append([0, 0, 0, x, y, 1, -v * x, -v * y]); rhs.append(v)
coef = np.linalg.solve(np.array(rows), np.array(rhs))
warped = screen.transform(render.size, Image.PERSPECTIVE, tuple(coef), Image.BICUBIC, fillcolor=screen.getpixel((sw // 2, sh - 1)))

edge = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
alpha = np.asarray(edge).astype(np.float32) / 255.0

out = np.asarray(render).astype(np.float32)
w = np.asarray(warped).astype(np.float32)
if a.glass > 0:
    h, wd = mask.shape
    yy, xx = np.mgrid[0:h, 0:wd]
    x0, y0 = xs.min(), ys.min()
    span = max(1, (xs.max() - x0) + (ys.max() - y0))
    t = np.clip(((xx - x0) + (yy - y0)) / span, 0, 1)
    sheen = np.clip(1 - np.abs(t - 0.28) / 0.28, 0, 1) * a.glass * 255
    w = np.clip(w + sheen[..., None], 0, 255)
comp = out * (1 - alpha[..., None]) + w * alpha[..., None]
fringe = (alpha > 0) & (alpha < 1)
cg = comp[..., 1]
lim = np.maximum(comp[..., 0], comp[..., 2]) + 8
comp[..., 1] = np.where(fringe & (cg > lim), lim, cg)
if not a.keep_green:
    outside = alpha < 0.02
    mx = np.maximum(comp[..., 0], comp[..., 2])
    spill = outside & (comp[..., 1] > mx + 6)
    comp[..., 1] = np.where(spill, mx + 0.15 * (comp[..., 1] - mx), comp[..., 1])
Image.fromarray(np.clip(comp, 0, 255).astype(np.uint8)).save(a.out, quality=92)
print("saved", a.out, render.size, "quad", [tuple(map(int, q)) for q in quad])
