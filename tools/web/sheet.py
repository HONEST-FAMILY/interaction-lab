import sys, glob
from PIL import Image
pattern, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
thumb_w = int(sys.argv[4]) if len(sys.argv) > 4 else 640
files = sorted(glob.glob(pattern))
ims = [Image.open(f) for f in files]
if not ims:
    sys.exit("no files")
r = thumb_w / ims[0].width
th = int(ims[0].height * r)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * thumb_w + (cols - 1) * 8, rows * th + (rows - 1) * 8), (255, 0, 255))
for i, im in enumerate(ims):
    im = im.convert("RGB").resize((thumb_w, th))
    sheet.paste(im, ((i % cols) * (thumb_w + 8), (i // cols) * (th + 8)))
sheet.save(out, quality=72)
print(out, len(ims))
