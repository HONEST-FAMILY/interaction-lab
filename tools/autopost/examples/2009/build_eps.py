import html
import os
import re
import shutil
import sys
import zipfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from script_data import EPISODES

SHOTS = Path(os.environ.get('SHOTS_DIR', HERE / 'shots'))
SITE = Path(os.environ.get('SITE_DIR', 'site'))
HASH = '621cf0e8'
ASSET = f'script-{HASH}'
WEB_W = 1280
SLUG = {'ep1': 'museum', 'maek': 'maekjeok'}
PAGE_TITLE = {
    'ep1': '월간 어니스트 1편 · 춘천 애니메이션 박물관',
    'maek': '포트폴리오 · 맥적 고깃집 프랜차이즈 홈페이지',
}
DRAFTS = {
    'ep1': [('1안', 'https://honest-family.com/showroom/cartoon-museum/mix/2/index.html'),
            ('2안', 'https://honest-family.com/showroom/cartoon-museum/sketchbook/index.html')],
    'maek': [('1안', 'https://honest-family.com/showroom/maekjeok/1/index.html'),
             ('2안', 'https://honest-family.com/showroom/maekjeok/2/index.html'),
             ('3안', 'https://honest-family.com/showroom/maekjeok/3/index.html')],
}
MEMO = {
    '두 시안이 움직이는 모습을 쭉 이어 붙이고, 인사말은 그 위에 얹습니다.': None,
    "박물관 홈페이지 화면에는 작은 자막 '애니메이션박물관 홈페이지 · 시설안내'. 사진 속 아이 얼굴은 흐리게 가렸습니다.":
        "박물관 홈페이지 화면에는 작은 자막 '애니메이션박물관 홈페이지 · 시설안내'. 사진 속 아이 얼굴은 흐리게 가립니다.",
    '1안을 녹화할 땐 박물관 로고와 박물관 사진·전시 포스터·영상 썸네일을 흐리게 가려 주세요. 시안에 박물관 것을 그대로 넣어 둔 자리입니다(그림 속 흐린 곳과 같은 자리).':
        '1안을 녹화할 땐 박물관 로고와 박물관 사진·전시 포스터·영상 썸네일을 흐리게 가려 주세요(그림 속 흐린 곳과 같은 자리).',
    "오늘 상태 줄은 정기 휴관(월요일)과 1월 1일만 압니다. 설·추석 당일과 '월요일이 공휴일이면 다음 날 휴관'은 시간표 아래 글로만 적혀 있어서, 대사도 월요일까지만 말합니다.": '',
    '2안 화면 속 카페·뮤지엄샵 시간, 서울에서 오는 시간, 토이로봇관 전화번호는 박물관 이용안내에서 아직 확인하지 못한 정보라 오래 비추지 않습니다. 시간표의 카페 글씨는 흐리게 가렸습니다.':
        '카페·뮤지엄샵 시간, 서울에서 오는 시간, 토이로봇관 전화번호가 보이는 곳은 오래 비추지 않습니다.',
    '관람 시간 1시간 반~2시간, 오후 4시 전 입장 권장, 예매 마감 오후 3시는 박물관 이용안내에 적힌 내용입니다.': '',
    '이 장면은 우리 홈페이지 화면을 띄우지 않고 아웃트로 그림 하나만 띄웁니다.': '',
    '세 시안은 설명란에 거는 우리 사이트 주소(1안·2안·3안)를 열어 찍으면 됩니다. 영상에 나오는 화면과 시청자가 눌러 보는 화면이 같습니다.':
        '세 시안은 위 1안·2안·3안 주소를 열어 찍으면 됩니다.',
}


def memo_text(m):
    if m in MEMO:
        return MEMO[m] if MEMO[m] is not None else m
    return m


def e(t):
    return html.escape(t, quote=True)


def nb(t):
    t = e(t)
    t = re.sub(r'(\d+)\s(월|일|시|분|초|곳|개|장|년|원|만|번째|층|명|편)', lambda m: m.group(1) + '&nbsp;' + m.group(2), t)
    return t


def nbcap(t):
    t = nb(t)
    i = t.rfind(' ')
    if i > 0 and len(t) - i <= 7:
        t = t[:i] + '&nbsp;' + t[i + 1:]
    return t


def linkify(t):
    out = []
    pos = 0
    for m in re.finditer(r'https?://\S+', t):
        out.append(e(t[pos:m.start()]))
        u = m.group(0)
        out.append(f'<a href="{e(u)}" target="_blank" rel="noopener">{e(u)}</a>')
        pos = m.end()
    out.append(e(t[pos:]))
    return ''.join(out)


def is_phone(f):
    with Image.open(SHOTS / f) as im:
        return im.height > im.width


def ep_files(ep):
    seen = []
    for sc in ep['scenes']:
        for b in sc['beats']:
            for f, _ in b['shots']:
                if f not in seen:
                    seen.append(f)
    return seen


def all_files():
    seen = []
    for ep in EPISODES:
        for f in ep_files(ep):
            if f not in seen:
                seen.append(f)
    return seen


def write_images(dst):
    w = dst / 'w'
    w.mkdir(parents=True, exist_ok=True)
    for f in all_files():
        with Image.open(SHOTS / f) as im:
            im = im.convert('RGB')
            if im.width > im.height and im.width > WEB_W:
                h = round(im.height * WEB_W / im.width)
                im = im.resize((WEB_W, h), Image.LANCZOS)
            im.save(w / f, quality=80, optimize=True, progressive=True)


def notes_text(ep):
    out = [f"{PAGE_TITLE[ep['id']]} — 장면별 자료화면", '']
    last = None
    for sc in ep['scenes']:
        part = sc.get('part') or sc['title']
        if part != last:
            out.append(f'■ {part}')
            last = part
        if not part.endswith(sc['title']):
            out.append(f'  [{sc["title"]}]')
        for b in sc['beats']:
            for f, cap in b['shots']:
                out.append(f'  자료화면 {f}: {cap}')
            for k, t in b['lines']:
                if k == 'C':
                    out.append(f'    [자막] {t}')
                elif k == 'S':
                    out.append(f'    [무음] {t}')
                else:
                    out.append(f'    {t}')
        for m in sc.get('memo', []):
            m2 = memo_text(m)
            if m2:
                out.append(f'  ※ {m2}')
        out.append('')
    return '\ufeff' + '\r\n'.join(out)


def write_zip(dst, ep):
    zp = dst / f"footage-{SLUG[ep['id']]}.zip"
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_STORED) as z:
        for f in ep_files(ep):
            z.write(SHOTS / f, f'shots/{f}')
        z.writestr('scene-notes.txt', notes_text(ep).encode('utf-8'))
    return zp


def render_shots(shots, sizes):
    if not shots:
        return ''
    phones = [s for s in shots if is_phone(s[0])]
    pcs = [s for s in shots if not is_phone(s[0])]
    out = []
    for f, cap in pcs:
        w, h = sizes[f]
        out.append(
            f'<figure class="shot"><a href="{ASSET}/w/{e(f)}" target="_blank" rel="noopener">'
            f'<img src="{ASSET}/w/{e(f)}" width="{w}" height="{h}" alt="" loading="lazy" decoding="async"></a>'
            f'<figcaption><span class="fn">{e(f)}</span>{nbcap(cap)}</figcaption></figure>')
    if phones:
        cls = 'phones one' if len(phones) == 1 else 'phones'
        items = []
        for f, cap in phones:
            w, h = sizes[f]
            items.append(
                f'<figure class="shot ph"><a href="{ASSET}/w/{e(f)}" target="_blank" rel="noopener">'
                f'<img src="{ASSET}/w/{e(f)}" width="{w}" height="{h}" alt="" loading="lazy" decoding="async"></a>'
                f'<figcaption><span class="fn">{e(f)}</span>{nbcap(cap)}</figcaption></figure>')
        out.append(f'<div class="{cls}">' + ''.join(items) + '</div>')
    return '<p class="tag">[자료화면]</p>' + ''.join(out)


def render_line(k, t):
    if k == 'C':
        return f'<p class="ln c">[자막] {nb(t)}</p>'
    if k == 'S':
        return f'<p class="ln s">[무음] {nb(t)}</p>'
    return f'<p class="ln">{nb(t)}</p>'


def render_scene(ep, sc, sizes, show_title):
    sid = f"{ep['id']}-s{sc['n']}"
    parts = [f'<article class="scene" id="{sid}">']
    if show_title:
        parts.append(f'<h3 class="st">{nb(sc["title"])}</h3>')
    for b in sc['beats']:
        parts.append('<div class="beat">')
        parts.append(render_shots(b['shots'], sizes))
        if b['lines']:
            parts.append('<div class="lines">' + ''.join(render_line(k, x) for k, x in b['lines']) + '</div>')
        parts.append('</div>')
    memos = [memo_text(m) for m in sc.get('memo', [])]
    memos = [m for m in memos if m]
    if memos:
        parts.append('<ul class="notes">' + ''.join(f'<li>※ {nb(m)}</li>' for m in memos) + '</ul>')
    parts.append('</article>')
    return ''.join(parts)


def plain_text(ep):
    out = [PAGE_TITLE[ep['id']], '']
    last = None
    for sc in ep['scenes']:
        part = sc.get('part') or sc['title']
        if part != last:
            if last is not None:
                out.append('')
            out.append(part)
            last = part
        if not part.endswith(sc['title']):
            out.append('')
            out.append(sc['title'])
        for b in sc['beats']:
            for f, cap in b['shots']:
                out.append(f'[자료화면] {cap}')
            for k, x in b['lines']:
                if k == 'C':
                    out.append(f'[자막] {x}')
                elif k == 'S':
                    out.append(f'[무음] {x}')
                else:
                    out.append(x)
    return chr(10).join(out)


def render_script(ep, sizes):
    out = []
    last = None
    chips = []
    for sc in ep['scenes']:
        part = sc.get('part') or sc['title']
        if part != last:
            if last is not None:
                out.append('</section>')
            pid = f"{ep['id']}-p{len(chips)}"
            chips.append((pid, part))
            out.append(f'<section class="part" id="{pid}"><h2>{nb(part)}</h2>')
            last = part
        show_title = not part.endswith(sc['title'])
        out.append(render_scene(ep, sc, sizes, show_title))
    out.append('</section>')
    return ''.join(out), chips


def render_package(ep):
    p = ep['package']
    pid = ep['id']
    titles = ''.join(f'<li>{e(x)}</li>' for x in p['titles'])
    thumb = ''.join(f'<li>{nb(x)}</li>' for x in p['thumb'])
    desc = '\n'.join(p['desc'])
    return (f'<section class="part" id="{pid}-up"><h2>올리기</h2>'
            f'<div class="card pkg"><h3>제목</h3><ol class="tt">{titles}</ol>'
            f'<h3>썸네일</h3><ul class="plain">{thumb}</ul>'
            f'<div class="copyhead"><h3>설명란</h3><button type="button" class="cp" data-copy="{pid}-desc">복사</button></div>'
            f'<pre class="box" id="{pid}-desc">{linkify(desc)}</pre>'
            f'<div class="copyhead"><h3>고정댓글</h3><button type="button" class="cp" data-copy="{pid}-pin">복사</button></div>'
            f'<pre class="box" id="{pid}-pin">{linkify(p["pin"])}</pre></div></section>')


CSS = """
:root{--ink:#191f28;--ink2:#333d4b;--ink3:#4e5968;--muted:#6b7684;--line:#e5e8eb;--bg:#f2f4f6;--card:#fff;--blue:#3182f6;--blued:#1b64da;--soft:#e8f3ff;--r:18px}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:100px}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased;word-break:keep-all;overflow-wrap:anywhere}
a{color:var(--blued)}
.bar{position:sticky;top:0;z-index:10;background:rgba(242,244,246,.94);-webkit-backdrop-filter:saturate(1.4) blur(10px);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid rgba(0,0,0,.04)}
.bar-in{max-width:680px;margin:0 auto;padding:10px 20px 8px}
.brand{font-size:13px;font-weight:700;color:var(--muted);display:flex;align-items:center;gap:6px}
.brand i{width:6px;height:6px;border-radius:50%;background:var(--blue);display:inline-block;flex:none}
.chips{display:flex;gap:6px;overflow-x:auto;margin:9px -20px 0;padding:0 20px 2px;scrollbar-width:none}
.chips::-webkit-scrollbar{display:none}
.chips a{flex:none;text-decoration:none;color:var(--ink2);background:var(--card);border-radius:999px;padding:6px 12px;font-size:13.5px;font-weight:700}
.wrap{max-width:680px;margin:0 auto;padding:0 20px calc(64px + env(safe-area-inset-bottom))}
.top{padding:26px 0 6px}
.kick{font-size:14px;font-weight:800;color:var(--blued);margin:0 0 4px}
h1{font-size:28px;line-height:1.34;letter-spacing:-.035em;margin:0 0 14px;font-weight:800;text-wrap:balance}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.btn{font:inherit;display:inline-flex;align-items:center;gap:6px;font-size:14.5px;font-weight:800;text-decoration:none;border:0;border-radius:12px;padding:10px 15px;cursor:pointer;background:var(--blue);color:#fff}
.btn.sub{background:var(--card);color:var(--ink)}
.links{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0;padding:0;list-style:none;font-size:15px}
.links b{color:var(--muted);font-weight:700;margin-right:2px}
.part{margin:40px 0 0}
.part>h2{font-size:22px;letter-spacing:-.03em;line-height:1.35;margin:0 0 12px;font-weight:800;text-wrap:balance}
.card{background:var(--card);border-radius:var(--r);padding:18px;margin:0 0 12px}
.card h3{font-size:16.5px;letter-spacing:-.02em;line-height:1.4;margin:18px 0 8px;font-weight:800}
.card h3:first-child{margin-top:0}
.scene{background:var(--card);border-radius:var(--r);padding:18px 16px 6px;margin:0 0 12px}
.st{font-size:18px;line-height:1.4;letter-spacing:-.02em;margin:0 0 12px;font-weight:800;text-wrap:balance}
.beat{margin:0 0 14px}
.tag{font-size:13.5px;font-weight:800;color:var(--muted);margin:0 0 8px}
.shot{margin:0 0 10px}
.shot a{display:block;border-radius:10px;overflow:hidden;background:#191f28;line-height:0}
.shot img{width:100%;height:auto;display:block}
.shot figcaption{font-size:13.5px;color:var(--muted);margin:6px 2px 0;line-height:1.55}
.shot .fn{display:inline-block;font-size:11.5px;font-weight:700;color:#8b95a1;background:#f2f4f6;border-radius:5px;padding:0 5px;margin-right:6px;font-variant-numeric:tabular-nums;vertical-align:1px}
.phones{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;max-width:440px;margin:0 auto 10px}
.phones.one{grid-template-columns:minmax(0,1fr);max-width:220px}
.phones .shot{margin:0}
.lines{margin:6px 0 0}
.ln{margin:0 0 10px;font-size:17px;line-height:1.75;color:var(--ink)}
.ln:last-child{margin-bottom:0}
.ln.c,.ln.s{font-size:15px;font-weight:700;color:var(--blued)}
.notes{list-style:none;margin:0 0 12px;padding:10px 0 0;border-top:1px solid #f0f2f4}
.notes li{font-size:13.5px;color:var(--muted);margin:0 0 4px;line-height:1.6}
.pkg .tt{margin:0;padding-left:20px}
.pkg .tt li{font-size:15.5px;font-weight:700;margin:4px 0;color:var(--ink)}
.plain{margin:0;padding-left:18px}
.plain li{font-size:14.5px;color:var(--ink2);margin:4px 0}
.copyhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 8px}
.copyhead h3{margin:0!important}
.cp{font:inherit;font-size:13.5px;font-weight:800;color:var(--blued);background:var(--soft);border:0;border-radius:999px;padding:5px 13px;cursor:pointer}
.box{margin:0;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere;font:inherit;font-size:14.5px;line-height:1.65;color:var(--ink2);background:#f7f8fa;border-radius:12px;padding:12px 13px}
.hide{position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden}
.pick{display:grid;gap:12px;margin:8px 0 0}
.pick a{display:block;text-decoration:none;background:var(--card);border-radius:var(--r);padding:20px;color:var(--ink)}
.pick a span{display:block;font-size:13.5px;font-weight:800;color:var(--blued);margin-bottom:2px}
.pick a b{font-size:19px;letter-spacing:-.02em}
p,li{text-wrap:pretty}
@media (max-width:360px){h1{font-size:25px}.ln{font-size:16px}}
@media (min-width:700px){.card,.scene{padding-left:24px;padding-right:24px}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
"""

JS = """
document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var el=document.getElementById(b.getAttribute('data-copy'));var t=el.innerText||el.textContent;var label=b.textContent;var done=function(m){b.textContent=m;setTimeout(function(){b.textContent=label},1800)};if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t).then(function(){done('복사됨')},function(){done('복사 안 됨')})}else{done('복사 안 됨')}})});
"""


def head(title):
    return (
        '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="robots" content="noindex, nofollow">\n<meta name="theme-color" content="#f2f4f6">\n'
        f'<title>{e(title)} · 유튜브 대본</title>\n'
        '<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>\n'
        '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">\n'
        f'<style>{CSS.strip()}</style>\n</head>\n<body>\n')


def build_episode(ep, sizes, zp):
    eid = ep['id']
    script, parts = render_script(ep, sizes)
    chips = ''.join(f'<a href="#{pid}">{e(name)}</a>' for pid, name in parts) + f'<a href="#{eid}-up">올리기</a>'
    links = ''.join(f'<li><b>{e(n)}</b><a href="{e(u)}" target="_blank" rel="noopener">{e(u.replace("https://", ""))}</a></li>' for n, u in DRAFTS[eid])
    kick, name = PAGE_TITLE[eid].split(' · ', 1)
    top = (f'<header class="top"><p class="kick">{e(kick)}</p><h1>{nb(name)}</h1>'
           f'<div class="acts"><button type="button" class="btn" data-copy="{eid}-plain">대본 복사</button>'
           f'<a class="btn sub" href="{ASSET}/{zp.name}" download>자료화면 받기 ({zp.stat().st_size / 1024 / 1024:.1f}MB)</a></div>'
           f'<ul class="links">{links}</ul></header>')
    plain = f'<pre class="hide" id="{eid}-plain" aria-hidden="true">{e(plain_text(ep))}</pre>'
    doc = (head(PAGE_TITLE[eid])
           + '<div class="bar"><div class="bar-in"><span class="brand"><i></i>어니스트패밀리&nbsp;· 유튜브 대본</span>'
           + f'<nav class="chips" aria-label="차례">{chips}</nav></div></div>\n'
           + f'<main class="wrap">\n{top}{script}{render_package(ep)}{plain}\n</main>\n<script>{JS.strip()}</script>\n</body>\n</html>\n')
    out = SITE / f'script-{HASH}-{SLUG[eid]}.html'
    out.write_text(doc, encoding='utf-8', newline='\n')
    return out


def build_index():
    items = ''.join(
        f'<a href="script-{HASH}-{SLUG[ep["id"]]}.html"><span>{e(PAGE_TITLE[ep["id"]].split(" · ", 1)[0])}</span><b>{e(PAGE_TITLE[ep["id"]].split(" · ", 1)[1])}</b></a>'
        for ep in EPISODES)
    js = ("(function(){var h=location.hash;if(!h)return;var m={'#ep1':'museum','#maek':'maekjeok'};"
          "for(var k in m){if(h.indexOf(k)===0){location.replace('script-" + HASH + "-'+m[k]+'.html'+(h===k?'':h));return}}})();")
    doc = (head('유튜브 대본')
           + '<main class="wrap"><header class="top"><h1>유튜브 대본</h1></header>'
           + f'<div class="pick">{items}</div></main>\n<script>{js}</script>\n</body>\n</html>\n')
    out = SITE / f'script-{HASH}.html'
    out.write_text(doc, encoding='utf-8', newline='\n')
    return out


def main():
    dst = SITE / ASSET
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)
    write_images(dst)
    sizes = {}
    for f in all_files():
        with Image.open(dst / 'w' / f) as im:
            sizes[f] = im.size
    for ep in EPISODES:
        zp = write_zip(dst, ep)
        p = build_episode(ep, sizes, zp)
        print(p.name, p.stat().st_size, zp.name, zp.stat().st_size)
    p = build_index()
    print(p.name, p.stat().st_size)


if __name__ == '__main__':
    main()
