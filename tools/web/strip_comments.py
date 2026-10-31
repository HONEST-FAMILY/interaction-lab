import re
import sys
from pathlib import Path


def strip_css(s):
    out, i, n = [], 0, len(s)
    q = None
    while i < n:
        c = s[i]
        if q:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(s[i + 1])
                i += 2
                continue
            if c == q:
                q = None
            i += 1
            continue
        if c in "\"'":
            q = c
            out.append(c)
            i += 1
            continue
        if s.startswith("/*", i):
            j = s.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


def strip_js(s):
    out, i, n = [], 0, len(s)
    stack = ["code"]
    depth = [0]
    prev_sig = ""
    while i < n:
        st = stack[-1]
        c = s[i]
        if st in ("'", '"'):
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(s[i + 1])
                i += 2
                continue
            if c == st or c == "\n":
                stack.pop()
            i += 1
            continue
        if st == "`":
            if c == "\\" and i + 1 < n:
                out.append(s[i:i + 2])
                i += 2
                continue
            if s.startswith("${", i):
                out.append("${")
                stack.append("code")
                depth.append(0)
                i += 2
                continue
            out.append(c)
            if c == "`":
                stack.pop()
            i += 1
            continue
        if st == "re":
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(s[i + 1])
                i += 2
                continue
            if c == "[":
                stack.append("cls")
            elif c == "/":
                stack.pop()
            i += 1
            continue
        if st == "cls":
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(s[i + 1])
                i += 2
                continue
            if c == "]":
                stack.pop()
            i += 1
            continue
        if s.startswith("/*", i):
            j = s.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        if s.startswith("//", i):
            j = s.find("\n", i)
            i = n if j < 0 else j
            continue
        if c in "'\"`":
            stack.append(c)
            out.append(c)
            i += 1
            prev_sig = c
            continue
        if c == "/":
            if prev_sig == "" or prev_sig in "(,=:[!&|?{};+-*%<>~^" or re.search(r"(?:^|[^\w$])(return|typeof|case|in|of|delete|void|throw|new)\s*$", "".join(out[-12:])):
                stack.append("re")
                out.append(c)
                i += 1
                prev_sig = "/"
                continue
        if c == "{":
            depth[-1] += 1
        elif c == "}":
            if len(stack) > 1 and depth[-1] == 0:
                stack.pop()
                depth.pop()
                out.append(c)
                i += 1
                prev_sig = "`"
                continue
            depth[-1] -= 1
        out.append(c)
        if not c.isspace():
            prev_sig = c
        i += 1
    return "".join(out)


def strip_html(s):
    parts = re.split(r"(<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>)", s, flags=re.S | re.I)
    res = []
    for p in parts:
        low = p[:7].lower()
        if low.startswith("<script"):
            m = re.match(r"(<script\b[^>]*>)(.*?)(</script>)", p, flags=re.S | re.I)
            res.append(m.group(1) + strip_js(m.group(2)) + m.group(3) if m and "src=" not in m.group(1) else p)
        elif low.startswith("<style"):
            m = re.match(r"(<style\b[^>]*>)(.*?)(</style>)", p, flags=re.S | re.I)
            res.append(m.group(1) + strip_css(m.group(2)) + m.group(3) if m else p)
        else:
            res.append(re.sub(r"<!--(?!\[if).*?-->", "", p, flags=re.S))
    return "".join(res)


def tidy(s):
    s = re.sub(r"[ \t]+\n", "\n", s)
    return re.sub(r"\n{3,}", "\n\n", s)


root = Path(sys.argv[1])
check = "--check" in sys.argv
for p in sorted(root.rglob("*")):
    if p.suffix not in (".css", ".js", ".html") or ".git" in p.parts:
        continue
    src = p.read_text(encoding="utf-8")
    fn = strip_css if p.suffix == ".css" else strip_js if p.suffix == ".js" else strip_html
    out = tidy(fn(src))
    if out != src:
        if not check:
            p.write_text(out, encoding="utf-8", newline="\n")
        print(("would strip " if check else "stripped ") + str(p.relative_to(root)), len(src) - len(out))
