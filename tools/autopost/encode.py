import argparse
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FFMPEG = os.environ.get("FFMPEG") or ("C:/Users/ssa41/bin/ffmpeg.exe" if os.path.exists("C:/Users/ssa41/bin/ffmpeg.exe") else "ffmpeg")
FFPROBE = str(Path(FFMPEG).with_name(Path(FFMPEG).name.replace("ffmpeg", "ffprobe"))) if "ffmpeg" in Path(FFMPEG).name else "ffprobe"
LOW = 0x00004000 if os.name == "nt" else 0
VF = "scale={size}flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p"
COLOR = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv"]


def run(cmd):
    print("+", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], check=True, creationflags=LOW)


def probe(path):
    r = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration,size,bit_rate:stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_frames,channels,sample_rate",
                        "-of", "json", str(path)], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def frame_count(frames):
    return len(list(Path(frames).glob("f_*.png")))


def x264(frames, fps, out, crf, preset="slow", size="", audio=False, threads=8, gop=None):
    n = frame_count(frames)
    dur = n / fps
    cmd = [FFMPEG, "-y", "-v", "error", "-framerate", f"{fps:g}", "-i", Path(frames) / "f_%05d.png"]
    if audio:
        cmd += ["-f", "lavfi", "-t", f"{dur:.6f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
    cmd += ["-map", "0:v:0"] + (["-map", "1:a:0"] if audio else [])
    cmd += ["-vf", VF.format(size=size), "-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-profile:v", "high", "-threads", str(threads),
            "-g", str(gop or int(round(fps * 2))), "-r", f"{fps:g}"] + COLOR
    cmd += (["-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000"] if audio else ["-an"])
    cmd += ["-movflags", "+faststart", out]
    run(cmd)
    return os.path.getsize(out)


def crf_search(make, out, limit, crf0, lo=14, hi=40, headroom=0.985):
    target = limit * headroom
    sizes = {}
    crf = crf0
    for _ in range(6):
        tmp = f"{out}.crf{crf}.mp4"
        sizes[crf] = make(crf, tmp)
        print(f"  crf {crf}: {sizes[crf] / 1e6:.3f} MB (limit {limit / 1e6:.3f})", flush=True)
        if sizes[crf] > target:
            if crf >= hi:
                break
            crf = min(hi, crf + max(1, math.ceil(6 * math.log2(sizes[crf] / target))))
            if crf in sizes:
                crf += 1
        else:
            nxt = crf - 1
            if nxt < lo or nxt in sizes or sizes[crf] > target * 0.86:
                break
            crf = nxt
    ok = sorted(c for c, s in sizes.items() if s <= target)
    if not ok:
        raise SystemExit(f"could not fit {out} under {limit} bytes: {sizes}")
    best = ok[0]
    for c in sizes:
        p = f"{out}.crf{c}.mp4"
        if c == best:
            shutil.move(p, out)
        elif os.path.exists(p):
            os.remove(p)
    return best, sizes


def jpeg_fit(img, out, max_kb, q0=92, qmin=50):
    for q in range(q0, qmin - 1, -2):
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=q, optimize=True, progressive=True, subsampling=2 if q < 90 else 1)
        if buf.tell() <= max_kb * 1024 or q <= qmin:
            Path(out).write_bytes(buf.getvalue())
            return q, buf.tell()
    raise SystemExit("unreachable")


def marks(timeline):
    return json.loads(Path(timeline).read_text(encoding="utf-8")).get("marks", {}) if timeline else {}


def pick(frames, spec, fps, mk):
    if isinstance(spec, str) and spec in mk:
        return mk[spec]
    if isinstance(spec, str) and spec.endswith("s"):
        return int(round(float(spec[:-1]) * fps))
    return int(spec)


def report(path, extra):
    pr = probe(path)
    v = next(s for s in pr["streams"] if s["codec_type"] == "video")
    a = [s for s in pr["streams"] if s["codec_type"] == "audio"]
    size = int(pr["format"]["size"])
    dur = float(pr["format"]["duration"])
    info = {"file": str(path), "bytes": size, "MB": round(size / 1e6, 3), "duration_s": round(dur, 3), "kbps": round(size * 8 / dur / 1000),
            "video": {k: v.get(k) for k in ("codec_name", "profile", "width", "height", "pix_fmt", "r_frame_rate", "nb_frames")},
            "audio": [{k: s.get(k) for k in ("codec_name", "channels", "sample_rate")} for s in a]}
    info.update(extra)
    print(json.dumps(info, ensure_ascii=False))
    return info


def cmd_hero(a):
    mk = marks(a.timeline)
    best, sizes = crf_search(lambda c, o: x264(a.frames, a.fps, o, c, preset=a.preset), a.out, a.max_mb * 1e6, a.crf)
    info = report(a.out, {"crf": best, "tried": {str(k): v for k, v in sizes.items()}})
    if a.poster:
        i = pick(a.frames, a.poster_frame, a.fps, mk)
        img = Image.open(Path(a.frames) / f"f_{i:05d}.png").convert("RGB")
        q, n = jpeg_fit(img, a.poster, a.poster_max_kb)
        print(json.dumps({"poster": a.poster, "frame": i, "quality": q, "bytes": n, "size": img.size}))
    return info


def cmd_thumb(a):
    mk = marks(a.timeline)
    src = sorted(Path(a.frames).glob("f_*.png"))
    s0 = pick(a.frames, a.start, a.src_fps, mk)
    step = int(round(a.src_fps / a.fps))
    L = int(round(a.dur * a.fps))
    m = int(round(a.xfade * a.fps))
    w, h = (int(v) for v in a.size.split("x"))
    tmp = Path(tempfile.mkdtemp(prefix="thumb_", dir=a.work))
    try:
        def get(j):
            im = Image.open(src[s0 + j * step]).convert("RGB")
            if im.size != (w, h):
                fx, fy = im.size[0] / w, im.size[1] / h
                im = im.reduce(int(fx)) if fx == fy and fx.is_integer() else im.resize((w, h), Image.LANCZOS)
            return np.asarray(im, dtype=np.float32)
        first = get(0)
        for j in range(L):
            fr = get(j)
            k = j - (L - m)
            if k >= 0:
                wgt = (k + 1) / (m + 1)
                wgt = wgt * wgt * (3 - 2 * wgt)
                fr = fr * (1 - wgt) + first * wgt
            Image.fromarray(np.clip(fr + 0.5, 0, 255).astype(np.uint8)).save(tmp / f"f_{j:05d}.png", compress_level=1)
        best, sizes = crf_search(lambda c, o: x264(tmp, a.fps, o, c, preset=a.preset, gop=L), a.out, a.max_kb * 1000, a.crf, hi=45)
        info = report(a.out, {"crf": best, "tried": {str(k): v for k, v in sizes.items()}, "source_frames": [s0, s0 + (L - 1) * step], "xfade_frames": m})
        if a.poster:
            pi = pick(a.frames, a.poster_frame, a.src_fps, mk) if a.poster_frame else s0
            img = Image.open(src[pi]).convert("RGB")
            if img.size != (w, h):
                img = img.reduce(img.size[0] // w) if img.size[0] % w == 0 and img.size[0] // w == img.size[1] // h else img.resize((w, h), Image.LANCZOS)
            q, n = jpeg_fit(img, a.poster, a.poster_max_kb)
            print(json.dumps({"poster": a.poster, "frame": pi, "quality": q, "bytes": n, "size": img.size}))
        return info
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def cmd_reel(a):
    mk = marks(a.timeline)
    best, sizes = crf_search(lambda c, o: x264(a.frames, a.fps, o, c, preset=a.preset, audio=True), a.out, a.max_mb * 1e6, a.crf)
    info = report(a.out, {"crf": best, "tried": {str(k): v for k, v in sizes.items()}})
    if a.cover:
        i = pick(a.frames, a.cover_frame, a.fps, mk)
        img = Image.open(Path(a.frames) / f"f_{i:05d}.png").convert("RGB")
        q, n = jpeg_fit(img, a.cover, a.cover_max_kb)
        print(json.dumps({"cover": a.cover, "frame": i, "quality": q, "bytes": n, "size": img.size}))
    return info


def cmd_sheet(a):
    pr = probe(a.video)
    v = next(s for s in pr["streams"] if s["codec_type"] == "video")
    num, den = (int(x) for x in v["r_frame_rate"].split("/"))
    fps = num / den
    n = int(v.get("nb_frames") or round(float(pr["format"]["duration"]) * fps))
    count = a.cols * a.rows
    idx = [round(i * (n - 1) / (count - 1)) for i in range(count)]
    W, H = int(v["width"]), int(v["height"])
    cw = a.cell_w
    ch = int(round(cw * H / W))
    tmp = Path(tempfile.mkdtemp(prefix="sheet_", dir=a.work))
    try:
        sel = "+".join(f"eq(n\\,{i})" for i in idx)
        run([FFMPEG, "-y", "-v", "error", "-i", a.video, "-vf", f"select='{sel}',scale={cw}:{ch}:flags=area", "-fps_mode", "passthrough", tmp / "s_%02d.png"])
        files = sorted(tmp.glob("s_*.png"))
        pad = 6
        sheet = Image.new("RGB", (a.cols * (cw + pad) + pad, a.rows * (ch + pad) + pad), (16, 16, 18))
        try:
            font = ImageFont.load_default(size=max(14, cw // 18))
        except TypeError:
            font = ImageFont.load_default()
        dr = ImageDraw.Draw(sheet)
        for j, f in enumerate(files):
            im = Image.open(f).convert("RGB")
            x = pad + (j % a.cols) * (cw + pad)
            y = pad + (j // a.cols) * (ch + pad)
            sheet.paste(im, (x, y))
            label = f"{idx[j] / fps:5.2f}s #{idx[j]}"
            dr.rectangle([x, y, x + len(label) * max(8, cw // 30) + 8, y + max(18, cw // 14)], fill=(0, 0, 0))
            dr.text((x + 4, y + 2), label, fill=(255, 255, 255), font=font)
        sheet.save(a.out, "JPEG", quality=86, optimize=True)
        print(json.dumps({"sheet": a.out, "frames": idx, "size": sheet.size, "bytes": os.path.getsize(a.out)}))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description="Encodes rec_smooth.py frame folders into web/hero, thumbnail-loop and reel deliverables")
    sub = ap.add_subparsers(dest="cmd", required=True)
    h = sub.add_parser("hero")
    h.add_argument("--frames", required=True)
    h.add_argument("--fps", type=float, default=60)
    h.add_argument("--out", required=True)
    h.add_argument("--max-mb", type=float, default=12)
    h.add_argument("--crf", type=int, default=20)
    h.add_argument("--preset", default="slow")
    h.add_argument("--timeline")
    h.add_argument("--poster")
    h.add_argument("--poster-frame", default="0")
    h.add_argument("--poster-max-kb", type=float, default=250)
    t = sub.add_parser("thumb")
    t.add_argument("--frames", required=True)
    t.add_argument("--src-fps", type=float, default=60)
    t.add_argument("--fps", type=float, default=30)
    t.add_argument("--start", default="0")
    t.add_argument("--dur", type=float, default=6.0)
    t.add_argument("--xfade", type=float, default=0.5)
    t.add_argument("--size", default="960x540")
    t.add_argument("--out", required=True)
    t.add_argument("--max-kb", type=float, default=900)
    t.add_argument("--crf", type=int, default=26)
    t.add_argument("--preset", default="slow")
    t.add_argument("--timeline")
    t.add_argument("--poster")
    t.add_argument("--poster-frame")
    t.add_argument("--poster-max-kb", type=float, default=120)
    t.add_argument("--work", default=None)
    r = sub.add_parser("reel")
    r.add_argument("--frames", required=True)
    r.add_argument("--fps", type=float, default=30)
    r.add_argument("--out", required=True)
    r.add_argument("--max-mb", type=float, default=40)
    r.add_argument("--crf", type=int, default=17)
    r.add_argument("--preset", default="slow")
    r.add_argument("--timeline")
    r.add_argument("--cover")
    r.add_argument("--cover-frame", default="0")
    r.add_argument("--cover-max-kb", type=float, default=600)
    s = sub.add_parser("sheet")
    s.add_argument("--video", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--cols", type=int, default=4)
    s.add_argument("--rows", type=int, default=6)
    s.add_argument("--cell-w", type=int, default=480)
    s.add_argument("--work", default=None)
    a = ap.parse_args()
    {"hero": cmd_hero, "thumb": cmd_thumb, "reel": cmd_reel, "sheet": cmd_sheet}[a.cmd](a)


if __name__ == "__main__":
    main()
