import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

TEXT = {".html", ".css", ".js", ".json", ".svg", ".txt"}
HERE = Path(__file__).resolve().parent


def skipped(rel, exclude):
    return any(x.startswith("_") or x in exclude for x in rel.parts)


def referenced(root, exclude):
    texts = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in TEXT and not skipped(p.relative_to(root), exclude)]
    blob = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in texts)
    keep, drop = list(texts), []
    for p in root.rglob("*"):
        if not p.is_file() or p.suffix.lower() in TEXT:
            continue
        rel = p.relative_to(root)
        if skipped(rel, exclude):
            continue
        name = p.name
        same = sum(1 for q in root.rglob(name) if q.is_file())
        two = p.parent.name + "/" + name
        stem = re.sub(r"[-_]?\d*$", "", p.stem)
        if rel.as_posix() in blob or two in blob:
            keep.append(p)
        elif same == 1 and re.search(r"[\"'/`]" + re.escape(name), blob):
            keep.append(p)
        elif stem and len(stem) > 3 and re.search(re.escape(stem) + r"[-_]?\$\{", blob):
            keep.append(p)
        else:
            drop.append(p)
    return keep, drop


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("site")
    ap.add_argument("names", nargs="+")
    ap.add_argument("--dest", required=True)
    ap.add_argument("--stage", default=None)
    ap.add_argument("--exclude", default="lab")
    ap.add_argument("--push", action="store_true")
    a = ap.parse_args()
    site = Path(a.site).resolve()
    stage = Path(a.stage).resolve() if a.stage else site.parent / (site.name + "_stage")
    if stage == site or site in stage.parents:
        sys.exit("stage must be outside the site folder")
    exclude = {x for x in a.exclude.split(",") if x}
    if stage.exists():
        shutil.rmtree(stage)
    for name in a.names:
        root = site / name
        if not (root / "index.html").exists():
            sys.exit(f"{root} has no index.html")
        keep, drop = referenced(root, exclude)
        size = 0
        for p in keep:
            out = stage / name / p.relative_to(root)
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, out)
            size += p.stat().st_size
        print(f"{name}: keep {len(keep)} files {size / 1e6:.1f}MB, drop {len(drop)}")
        for p in drop[:30]:
            print("   drop", p.relative_to(site))
    subprocess.run([sys.executable, str(HERE / "strip_comments.py"), str(stage)], check=True)
    print("staged at", stage)
    if a.push:
        dest = Path(a.dest).resolve()
        dest.mkdir(parents=True, exist_ok=True)
        for name in a.names:
            dst = dest / name
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(stage / name, dst)
        print("copied to", dest)


if __name__ == "__main__":
    main()
