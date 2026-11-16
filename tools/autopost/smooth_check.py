import argparse
import json
import os
import subprocess
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

FFMPEG = os.environ.get("FFMPEG") or ("C:/Users/ssa41/bin/ffmpeg.exe" if os.path.exists("C:/Users/ssa41/bin/ffmpeg.exe") else "ffmpeg")
FFPROBE = str(Path(FFMPEG).with_name(Path(FFMPEG).name.replace("ffmpeg", "ffprobe"))) if "ffmpeg" in Path(FFMPEG).name else "ffprobe"
MOTION = ("scroll_to", "scroll_by")


def gray_png(path, fx):
    a = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    if fx > 1:
        w = a.shape[1] // fx * fx
        a = a[:, :w].reshape(a.shape[0], w // fx, fx).mean(axis=2)
    return a


def video_frames(path, w, h, fx):
    cmd = [FFMPEG, "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = w * h
    try:
        while True:
            buf = p.stdout.read(n)
            if len(buf) < n:
                break
            a = np.frombuffer(buf, dtype=np.uint8).reshape(h, w).astype(np.float32)
            if fx > 1:
                ww = w // fx * fx
                a = a[:, :ww].reshape(h, ww // fx, fx).mean(axis=2)
            yield a
    finally:
        p.stdout.close()
        p.wait()


def mad(A, B, s, r0, r1):
    lo, hi = max(r0, r0 - s), min(r1, r1 - s)
    if hi - lo < 16:
        return float("inf")
    return float(np.mean(np.abs(B[lo:hi] - A[lo + s:hi + s])))


def measure(A, B, d, r0, r1, reach):
    q = (r1 - r0) // 4
    A4 = A[r0:r0 + 4 * q].reshape(q, 4, A.shape[1]).mean(axis=1)
    B4 = B[r0:r0 + 4 * q].reshape(q, 4, B.shape[1]).mean(axis=1)
    R4 = max(2, int(reach // 4) + 2)
    coarse = min(range(-R4, R4 + 1), key=lambda s: mad(A4, B4, s, 0, A4.shape[0]))
    cands = set(range(int(round(d)) - 6, int(round(d)) + 7)) | set(range(coarse * 4 - 5, coarse * 4 + 6)) | {0}
    scores = {s: mad(A, B, s, r0, r1) for s in cands}
    best = min(scores, key=scores.get)
    return best, scores


def classify(A, B, d, r0, r1, reach, tol):
    if np.array_equal(A, B):
        return ("dup" if abs(d) >= 1 else "still"), 0, 0.0
    best, sc = measure(A, B, d, r0, r1, reach)
    dd = int(round(d))
    if abs(best - d) <= tol:
        return "ok", best, sc[best]
    if best == 0 or sc.get(0, 1e9) <= sc.get(dd, 1e9):
        return "pinned", best, sc[best]
    return "bad", best, sc[best]


def analyse(frames_iter, tl, top, bottom, tol, label):
    fps = tl["fps"]
    dpr = tl["dpr"]
    rec = sorted((f for f in tl["frames"] if "i" in f), key=lambda f: f["i"])
    n = len(rec)
    seg_of = {}
    for s in tl["segments"]:
        for i in range(s["i0"], s["i1"]):
            seg_of[i] = s
    planned = [0.0] + [(rec[i]["ya"] - rec[i - 1]["ya"]) * dpr for i in range(1, n)]
    reach = max(abs(x) for x in planned) + 40
    out = {"label": label, "frames": 0, "pairs": Counter(), "segments": [], "anomalies": []}
    per = {}
    prev = None
    H = None
    for i, B in enumerate(frames_iter):
        out["frames"] += 1
        if H is None:
            H = B.shape[0]
            r0, r1 = int(round(top * dpr)), H - int(round(bottom * dpr))
        if prev is not None and i < n:
            seg = seg_of.get(i)
            d = planned[i]
            in_motion = seg is not None and seg["do"] in MOTION
            drag = seg is not None and seg["do"] in ("drag", "move")
            if in_motion:
                c, s, err = classify(prev, B, d, r0, r1, reach, tol)
                per[i] = (c, s, d)
                out["pairs"][c] += 1
                if c in ("dup", "bad"):
                    out["anomalies"].append({"i": i, "t": round(i / fps, 3), "class": c, "planned": round(d, 2), "measured": s, "step": seg["step"]})
            elif drag:
                same = np.array_equal(prev, B)
                out["pairs"]["drag-dup" if same else "drag-moving"] += 1
                if same:
                    out["anomalies"].append({"i": i, "t": round(i / fps, 3), "class": "drag-dup", "step": seg["step"]})
        prev = B
    for s in tl["segments"]:
        if s["do"] not in MOTION or s["i1"] - s["i0"] < 4:
            continue
        idx = list(range(s["i0"], s["i1"]))
        m = len(idx)
        mid = idx[int(m * 0.2): int(m * 0.8) + 1]
        pl = [abs(planned[i]) for i in mid]
        meas = [abs(per[i][1]) for i in mid if i in per and per[i][0] == "ok"]
        classes = Counter(per[i][0] for i in idx if i in per)

        def cons(v):
            r = [max(a, b) / max(1e-9, min(a, b)) for a, b in zip(v, v[1:]) if a > 0 and b > 0]
            return round(max(r), 3) if r else None

        sign = [np.sign(planned[i]) for i in idx if planned[i] != 0]
        msign = [np.sign(per[i][1]) for i in idx if i in per and per[i][0] == "ok" and per[i][1] != 0]
        out["segments"].append({
            "step": s["step"], "label": s.get("label", ""), "frames": m, "t0": round(s["i0"] / fps, 3), "t1": round(s["i1"] / fps, 3),
            "planned_mid_min": round(min(pl), 2) if pl else None, "planned_mid_max": round(max(pl), 2) if pl else None,
            "planned_mid_maxmin": round(max(pl) / max(1e-9, min(pl)), 3) if pl else None,
            "measured_mid_maxmin": round(max(meas) / max(1e-9, min(meas)), 3) if meas else None,
            "planned_consecutive_max": cons(pl), "measured_consecutive_max": cons(meas),
            "monotonic_planned": len(set(sign)) <= 1, "monotonic_measured": len(set(msign)) <= 1,
            "max_abs_error_px": max((abs(per[i][1] - planned[i]) for i in idx if i in per and per[i][0] == "ok"), default=None),
            "classes": dict(classes),
        })
    out["pairs"] = dict(out["pairs"])
    return out


def main():
    ap = argparse.ArgumentParser(description="Motion uniformity checker for rec_smooth.py recordings")
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--frames", help="frames folder (f_00000.png ...)")
    ap.add_argument("--video", help="encoded video to check against the plan (same frame rate as the recording)")
    ap.add_argument("--top", type=float, default=90, help="CSS px band at the top to ignore (fixed header)")
    ap.add_argument("--bottom", type=float, default=0, help="CSS px band at the bottom to ignore (fixed bars)")
    ap.add_argument("--fx", type=int, default=4, help="horizontal downsample factor")
    ap.add_argument("--out")
    a = ap.parse_args()
    tl = json.loads(Path(a.timeline).read_text(encoding="utf-8"))
    rec = [f for f in tl["frames"] if "i" in f]
    report = {"plan": tl.get("plan"), "fps": tl["fps"], "dpr": tl["dpr"], "recorded": tl["recorded"]}
    report["scroll_actual_vs_planned_max_css_px"] = max((abs(f["ya"] - f["y"]) for f in rec), default=0)
    rafs = Counter()
    for f in tl["frames"]:
        rafs[1 if f["r"][1] > 0 else 0] += 1
    report["virtual_ticks"] = len(tl["frames"])
    report["ticks_without_raf_batch"] = rafs.get(0, 0)
    report["pointer_events_on_time"] = tl.get("pointer_on_time")
    logs = [f.get("log") for f in rec if isinstance(f.get("log"), list)]
    if logs:
        inc = [round(b[0] - a_[0], 3) for a_, b in zip(logs, logs[1:])]
        report["log0_increment_histogram"] = Counter(inc).most_common(8)
    if a.frames:
        files = sorted(Path(a.frames).glob("f_*.png"))
        report["frames_check"] = analyse((gray_png(p, a.fx) for p in files), tl, a.top, a.bottom, 1.0, "frames")
    if a.video:
        pr = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames,r_frame_rate", "-of", "json", str(a.video)],
                            capture_output=True, text=True, check=True)
        st = json.loads(pr.stdout)["streams"][0]
        report["video"] = {"file": str(a.video), "width": st["width"], "height": st["height"], "frames": int(st["nb_read_frames"]), "rate": st["r_frame_rate"]}
        report["video_check"] = analyse(video_frames(a.video, st["width"], st["height"], a.fx), tl, a.top, a.bottom, 1.5, "video")
    text = json.dumps(report, ensure_ascii=False, indent=1, default=lambda o: int(o) if isinstance(o, np.integer) else str(o))
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
    for key in ("frames_check", "video_check"):
        r = report.get(key)
        if not r:
            continue
        print(f"[{key}] frames={r['frames']} pairs={r['pairs']} anomalies={len(r['anomalies'])}")
        for s in r["segments"]:
            print(f"  step {s['step']:2d} {s['label']:12s} {s['t0']:6.2f}-{s['t1']:6.2f}s n={s['frames']:3d} plan mid {s['planned_mid_min']}-{s['planned_mid_max']}px "
                  f"maxmin plan={s['planned_mid_maxmin']} meas={s['measured_mid_maxmin']} consec plan={s['planned_consecutive_max']} meas={s['measured_consecutive_max']} "
                  f"mono={s['monotonic_planned']}/{s['monotonic_measured']} err={s['max_abs_error_px']} {s['classes']}")
        for an in r["anomalies"][:20]:
            print("  ANOMALY", an)
    print("scroll actual-vs-planned max (css px):", report["scroll_actual_vs_planned_max_css_px"], "| ticks without rAF batch:", report["ticks_without_raf_batch"], "/", report["virtual_ticks"],
          "| pointer on time:", report["pointer_events_on_time"], "| log0 increments:", report.get("log0_increment_histogram"))
    if "video" in report:
        print("video:", report["video"])


if __name__ == "__main__":
    main()
