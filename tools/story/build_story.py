import argparse
import base64
import html
import importlib.util
import json
import os
import pathlib
import re
import sys

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
CARD_TYPES = {"scene", "talk", "list", "quiz", "numbers", "spine", "decide", "cast", "start", "end"}
PIC_TYPES = {"img", "notify", "quote", "doors", "flow", "route", "money", "fork", "traps", "trap", "chat", "msgr",
             "blocks", "pay", "phrases", "checks", "price", "house", "weeks", "chips", "vs", "steps", "pcard", "album", "search", "scan"}


def load_content(path):
    spec = importlib.util.spec_from_file_location("deck_content", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.DECK


def as_list(x):
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


def check(deck):
    errors = []
    ids = {p["id"] for p in deck.get("cast", [])}
    total = 0
    for ci, ch in enumerate(deck["chapters"]):
        for k, c in enumerate(ch["cards"]):
            total += 1
            where = f"{ch.get('no') or ch['title']} 카드 {k + 1}"
            t = c.get("type", "scene")
            if t not in CARD_TYPES:
                errors.append(f"{where}: 모르는 type {t}")
            for p in as_list(c.get("pic")):
                if p.get("type") not in PIC_TYPES:
                    errors.append(f"{where}: 모르는 그림 {p.get('type')}")
            if t == "quiz":
                if not (0 <= c["answer"] < len(c["options"])):
                    errors.append(f"{where}: 정답 번호가 보기 밖")
            if t == "talk":
                for line in c["lines"]:
                    if line["who"] not in ids:
                        errors.append(f"{where}: 등장인물 {line['who']} 없음")
            if t == "cast":
                for i in c["ids"]:
                    if i not in ids:
                        errors.append(f"{where}: 등장인물 {i} 없음")
            text = json.dumps(c, ensure_ascii=False)
            if re.search(r"<[a-zA-Z/]", text):
                errors.append(f"{where}: 글에 태그가 섞여 있음")
            for b in as_list(c.get("buttons")):
                if b.get("copy") and b["copy"] not in deck.get("copies", {}):
                    errors.append(f"{where}: 복사할 글 {b['copy']} 없음")
    seen = set()
    for ci, ch in enumerate(deck["chapters"]):
        for k, c in enumerate(ch["cards"]):
            cid = c.setdefault("id", f"c{ci}-{k}")
            if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", cid):
                errors.append(f"카드 id 꼴이 틀림: {cid}")
            if cid in seen:
                errors.append(f"카드 id 겹침: {cid}")
            seen.add(cid)
    if errors:
        raise SystemExit("\n".join(errors))
    return total


def copy_images(deck, out):
    img_dir = out / "img"
    img_dir.mkdir(parents=True, exist_ok=True)
    srcs = deck.get("images", {})
    used = set()
    for ch in deck["chapters"]:
        for c in ch["cards"]:
            for p in as_list(c.get("pic")):
                if p.get("type") == "img":
                    name = p["src"]
                    if name not in srcs:
                        raise SystemExit(f"그림 원본 없음: {name}")
                    used.add(name)
                    p["src"] = "img/" + name
    for name in sorted(used):
        im = Image.open(srcs[name]).convert("RGB")
        w = 640
        if im.width > w:
            im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(img_dir / name, quality=80, optimize=True, progressive=True)
    return sorted(used)


PAGE = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="theme-color" content="#ffffff">
<title>{title}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%23191F28'/%3E%3Cpath d='M10 9h8a5 5 0 0 1 0 10h-4v4h-4z' fill='%23fff'/%3E%3C/svg%3E">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>{css}</style>
</head>
<body>
<div class="app" id="app" data-tone="blue">
<header class="top"><div class="bars" id="bars"></div><div class="toprow"><div class="toplabel" id="toplabel"></div><button type="button" class="qbox" id="qbox" hidden>질문함</button><button type="button" class="menu" id="menu">목차</button></div></header>
<main class="stage" id="stage"><noscript><div class="card"><p>이 페이지는 자바스크립트를 켜야 보여요.</p></div></noscript></main>
<footer class="nav"><button type="button" class="prev" id="prev">이전</button><button type="button" class="askq" id="askq" hidden>질문</button><button type="button" class="next" id="next">다음</button></footer>
<div class="sheet" id="sheet" hidden><div class="sheet-in" role="dialog" aria-label="목차"><div class="sh-head"><b>목차</b><button type="button" id="closesheet">닫기</button></div><div id="tocbox"></div><div class="sh-foot"><button type="button" id="restart">처음부터</button><a href="#all" onclick="setTimeout(function(){{location.reload()}},0)">한 번에 다 보기</a></div></div></div>
<div class="sheet" id="qsheet" hidden><div class="sheet-in qs" role="dialog" aria-label="질문"></div></div>
<button type="button" class="morehint" id="morehint">아래에 더 있어요 ↓</button>
<div class="toast" id="toast" role="status"></div>
</div>
<script type="application/json" id="deck-data">{data}</script>
<script>{js}</script>
</body>
</html>
"""


def plain_text(deck):
    out = []
    cast = {p["id"]: p for p in deck.get("cast", [])}
    strip = lambda s: re.sub(r"\*\*|==", "", s or "")
    for ch in deck["chapters"]:
        out.append(f"\n## {ch.get('no', '')} {ch['title']}")
        for c in ch["cards"]:
            t = c.get("type", "scene")
            parts = []
            for key in ("kicker", "title", "eyebrow"):
                if c.get(key):
                    parts.append(strip(c[key]))
            for p in as_list(c.get("pic")):
                parts.append("[그림] " + strip(json.dumps({k: v for k, v in p.items() if k not in ("type", "src")}, ensure_ascii=False)))
            for b in as_list(c.get("body")):
                parts.append(strip(b))
            if t == "talk":
                for line in c["lines"]:
                    parts.append(f"{line.get('label') or cast[line['who']]['name']}: {strip(line['text'])}")
            if t in ("list",):
                for it in c["items"]:
                    parts.append("- " + (" — ".join(strip(x) for x in it) if isinstance(it, list) else strip(it)))
            if t in ("numbers", "spine"):
                for it in c["items"]:
                    parts.append("- " + " ".join(strip(x) for x in it))
            if t == "cast":
                for i in c["ids"]:
                    parts.append(f"- {cast[i]['name']}: {strip(cast[i].get('role', ''))}")
            if t == "decide":
                for d in c["items"]:
                    parts.append(f"- {strip(d['q'])} / {strip(d['options'])} / 권고 {d['rec']} — {strip(d['why'])}")
            if t == "quiz":
                parts.append("문제: " + strip(c["q"]))
                for k, o in enumerate(c["options"]):
                    parts.append(f"  {'ABCD'[k]}. {strip(o)}")
                parts.append(f"  정답 {'ABCD'[c['answer']]} — {strip(c['why'])}")
            for key, lab in (("remember", "기억"), ("tip", "요령"), ("ban", "이 말은 금지"), ("teaser", ""), ("note", "")):
                if c.get(key):
                    parts.append((lab + ": " if lab else "") + strip(c[key]))
            if c.get("more"):
                for l in as_list(c["more"].get("lines")):
                    parts.append("근거: " + (strip(l) if isinstance(l, str) else strip(l.get("text", "")) + " " + l.get("href", "")))
            out.append("\n".join(parts))
            out.append("---")
    return "\n".join(out)


def seal(obj, key_b64u):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = base64.urlsafe_b64decode(key_b64u + "=" * (-len(key_b64u) % 4))
    if len(key) != 32:
        raise SystemExit("봉인 열쇠는 32바이트여야 함")
    iv = os.urandom(12)
    data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(iv + AESGCM(key).encrypt(iv, data, None)).decode().rstrip("=")


def build(content_path, out_dir, board=None, seal_key=None):
    deck = load_content(content_path)
    total = check(deck)
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    used = copy_images(deck, out)
    if seal_key and used:
        raise SystemExit("봉인한 판에는 그림 파일을 쓰지 않음(그림은 봉인되지 않음)")
    css = (HERE / "story.css").read_text(encoding="utf-8")
    js = (HERE / "story.js").read_text(encoding="utf-8")
    public = {k: v for k, v in deck.items() if k != "images"}
    title = deck["title"]
    if seal_key:
        title = deck.get("lock_page_title", "이야기판")
        payload = {"key": deck["key"], "title": title, "lockTitle": deck.get("lock_title", "보는 사람이 정해진 이야기예요"), "sealed": seal(public, seal_key)}
    else:
        payload = public
    if board:
        payload["board"] = board
    data = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    page = PAGE.format(title=html.escape(title), css=css, js=js, data=data)
    (out / "index.html").write_text(page, encoding="utf-8")
    (out.parent / f"{out.name}_story.txt").write_text(plain_text(deck), encoding="utf-8")
    return total, used


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("content")
    ap.add_argument("out")
    ap.add_argument("--board")
    ap.add_argument("--api", default="https://api.dashboard.honest-family.com/api")
    ap.add_argument("--seal-key-file")
    a = ap.parse_args()
    board = {"key": a.board, "api": a.api.rstrip("/")} if a.board else None
    seal_key = pathlib.Path(a.seal_key_file).read_text(encoding="utf-8").strip() if a.seal_key_file else None
    total, used = build(a.content, a.out, board, seal_key)
    print(f"cards {total} images {len(used)} board {'on' if board else 'off'} sealed {'yes' if seal_key else 'no'} -> {a.out}")
