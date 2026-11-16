import argparse
import re
import sys
from pathlib import Path

END = ('.', '?', '!', '요', '다', '고', ',')


def norm(t):
    return re.sub(r'[\s\.,!?·~\-–—"\'()]+', '', t)


def spoken(lines):
    out = []
    for raw in lines:
        t = raw.strip()
        if not t or t.startswith(('[', '#', '※', '-', '(')) or 'http' in t:
            continue
        if len(t) < 14 and not t.endswith(END):
            continue
        out.append(t)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('owner')
    ap.add_argument('script')
    ap.add_argument('--fix', action='append', default=[])
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    owner = Path(a.owner).read_text(encoding='utf-8')
    for pair in a.fix:
        x, y = pair.split('=', 1)
        owner = owner.replace(x, y)
    script = norm(''.join(spoken(Path(a.script).read_text(encoding='utf-8').splitlines())))
    lines = spoken(owner.splitlines())
    miss = [t for t in lines if norm(t) not in script]
    print(f'원고 문장 {len(lines)}개 중 대본에 그대로 있는 것 {len(lines) - len(miss)}개')
    for t in miss:
        print('  없음:', t)
    sys.exit(1 if miss else 0)


if __name__ == '__main__':
    main()
