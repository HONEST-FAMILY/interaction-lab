import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from script_data import MAEK, N, PRICE_CAP

SITE = 'https://honest-family.com'
IMG = f'{SITE}/blog-assets/portfolio/maekjeok'
VID = f'{SITE}/blog-assets/video/maekjeok'


def utm(url, content):
    return f'{url}?utm_source=blog&utm_medium=post&utm_campaign=portfolio&utm_content={content}'


DRAFTS = [
    ('1안 체험하기', utm(f'{SITE}/showroom/maekjeok/1/index.html', 'maekjeok_draft1')),
    ('2안(최종 채택) 체험하기', utm(f'{SITE}/showroom/maekjeok/2/index.html', 'maekjeok_draft2')),
    ('3안 체험하기', utm(f'{SITE}/showroom/maekjeok/3/index.html', 'maekjeok_draft3')),
]
PRICE = utm(f'{SITE}/price', 'maekjeok')
# 가격 문장 끝에 붙이는 기준 표시 = 대본 가격 자막의 마지막 괄호 안 그대로 ('2026년 11월 가격표, 부가세 별도')
PRICE_BASIS = PRICE_CAP[PRICE_CAP.rindex('(') + 1:PRICE_CAP.rindex(')')]
assert '가격표' in PRICE_BASIS, PRICE_BASIS


ALT = {
    'm01-a': '맥적 전주본점 소개 구간',
    'm02-t': '맥적 홈페이지 시안 세 개, 왼쪽부터 1안, 2안, 3안',
    'm03-a': '맥적 홈페이지 1안 첫 화면',
    'm03-b': '1안, 맥적이라는 이름의 유래',
    'm03-c': '1안, 벽화로 표현한 그래픽',
    'm03-d': '1안, 3단 마이야르 전통구이 기법',
    'm03-e': '1안, 메뉴와 가격',
    'm03-f': '1안, 브랜드가 하는 사업',
    'm03-g': '1안, 가맹점 문의 창구',
    'm04-a': '맥적 홈페이지 2안 첫 화면',
    'm04-b': '2안, 문지르면 드러나는 벽화',
    'm04-c': '2안, 다 드러난 구이의 원형 벽화',
    'm04-e': '2안, 큼직한 배치와 옛 서체 제목',
    'm04-f': '2안, 메뉴 구간',
    'm05-a': '맥적 홈페이지 3안 첫 화면',
    'm05-b': '3안, 메뉴와 가격',
    'm05-c': '3안, 회사 소개',
}


def img(f, cap):
    return f"![{ALT[f.rsplit('.', 1)[0]]}]({IMG}/{f})"


def ends_open(t):
    return not t.rstrip().endswith(('.', '?', '!', '요', '다'))


def scene_blocks(sc):
    blocks = []
    group = None
    for b in sc['beats']:
        shots = list(b['shots'])
        lines = [t for k, t in b['lines'] if k != 'C']
        if group is None:
            group = {'first': shots, 'text': list(lines), 'rest': []}
        else:
            group['rest'] += shots
            group['text'] += lines
        if not group['text'] or not ends_open(group['text'][-1]):
            blocks.append(group)
            group = None
    if group:
        blocks.append(group)
    return blocks


def join_lines(lines):
    out = ''
    for t in lines:
        if not out:
            out = t
        elif out.endswith(','):
            out += ' ' + t
        elif ends_open(out):
            out += ', ' + t
        else:
            out += ' ' + t
    return out


def body():
    out = []
    scenes = {sc['n']: sc for sc in MAEK['scenes']}
    for k, t in scenes[0]['beats'][0]['lines']:
        out.append(t)
        out.append('')
    for n, head in ((1, '## 의뢰 배경'), (2, '## 우리의 실제 진행 과정'), (3, '### 1안'), (4, '### 2안'), (5, '### 3안')):
        out.append(head)
        out.append('')
        for g in scene_blocks(scenes[n]):
            for f, cap in g['first']:
                out.append(img(f, cap))
                out.append('')
            merged = len(g['rest']) > 0
            if merged:
                out.append(join_lines(g['text']))
                out.append('')
            else:
                for t in g['text']:
                    out.append(t)
                    out.append('')
            for f, cap in g['rest']:
                out.append(img(f, cap))
                out.append('')
    out.append('## 직접 써보고 싶다면?')
    out.append('')
    out.append('직접 써보고 싶으신 분들을 위해, 세 시안 모두 링크를 걸어두었습니다.')
    out.append('')
    for name, u in DRAFTS:
        out.append(f'- [{name}]({u})')
    out.append('')
    # 마무리 = 대본의 '의뢰하고 싶다면?' 장면 그대로 (라이브러리 대본 틀 노트 '마무리 가격', 2026-11-17 대표 승인).
    # 고정 두 문장 → 그날 가격표 숫자 문장(마지막 문장 끝에 기준 연·월) → 가격표 링크 → 끝인사. [자막] 줄은 글에 넣지 않는다.
    out.append('## 의뢰하고 싶다면?')
    out.append('')
    ask = [t for k, t in scenes[7]['beats'][0]['lines'] if k == N]
    head, prices, bye = ask[:2], ask[2:-2], ask[-1]
    assert prices, '가격 문장이 없다. script_data 의 ASK(가격 자막, 가격 문장…) 을 그날 가격표로 채운다'
    for t in head:
        out.append(t)
        out.append('')
    for i, t in enumerate(prices):
        if i == len(prices) - 1:
            t = t.rstrip('.') + f'({PRICE_BASIS}).'
        out.append(t)
        out.append('')
    out.append(f'가격표 전체는 [가격정찰제]({PRICE}) 링크를 참고하세요.')
    out.append('')
    out.append(bye)
    return '\n'.join(out).strip() + '\n'


def payload():
    # 제목 = 올리기 칸 제목 ①, 요약 = 인트로의 미리 알림 문장(질문 → 인사 → 소개 → 미리 알림 중 넷째)
    preview = MAEK['scenes'][0]['beats'][0]['lines'][3][1]
    return {
        'source_key': 'portfolio:maekjeok',
        'title': MAEK['package']['titles'][0],
        'body': body(),
        'excerpt': preview,
        'thumbnail': f'{VID}/thumb.jpg',
        'video_url': f'{VID}/hero.mp4',
        'target_keyword': '고깃집 홈페이지 제작',
        'hashtags': ['고객사례', '홈페이지제작', '고깃집홈페이지', '프랜차이즈홈페이지', '맥적', '홈페이지제작비용'],
        'category': 'journal',
        'published': True,
    }


if __name__ == '__main__':
    here = Path(__file__).resolve().parent
    p = payload()
    (here / 'maek_body.md').write_text(p['body'], encoding='utf-8')
    (here / 'maek_payload.json').write_text(json.dumps(p, ensure_ascii=False, indent=1), encoding='utf-8')
    print(len(p['body']), 'chars')
