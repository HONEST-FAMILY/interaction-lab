# 이야기판 (tools/story)

미팅 준비·인수인계·처음 보는 내용을 **한 장씩 넘기며 익히는 페이지** 한 장(index.html)을 만든다.
원고(파이썬 파일 하나)만 쓰면 화면은 이 도구가 만든다 — 한 장씩 넘기기, 이어 보기, 목차, 장 끝 문제 채점, 틀린 장 다시 보기, 문안 복사, 전체 보기(`#all`), 장 번호로 열기(`#p=N`).

준비: Python 3, `pip install playwright pillow cryptography`, 크롬 설치.

## 순서

```
1) 원고 쓰기      example/content_example.py 를 복사해 고친다
2) 만들기         python -I C:/project/interaction-lab/tools/story/build_story.py 원고.py 출력폴더 [--board 판열쇠] [--seal-key-file 열쇠파일]
3) 화면 점검      python C:/project/interaction-lab/tools/web/one.py python -I C:/project/interaction-lab/tools/story/check_story.py 출력폴더 결과.json 416x525 "416x525,870x557,360x648,1440x900"
4) 이어 보기 점검  python C:/project/interaction-lab/tools/web/one.py python -I C:/project/interaction-lab/tools/story/probe_resume.py 출력폴더 story:원고의key 416x525,870x557
5) 처음 읽는 사람 시험  출력폴더 옆에 생기는 <폴더이름>_story.txt 만 주고 예상 질문에 답하게 한다
```

- 만들기는 출력 폴더를 지우지 않는다. 새 판은 새 폴더로.
- 점검 합격선: 모든 크기에서 `over 0`·`wide 0`·`errors []`. 416x525(폰 접은 화면)·870x557(펼친 화면)에서 한 장이 화면 안에 들어와야 한다. 넘치면 글을 줄이거나 장을 둘로 나눈다.
- 헤드리스 크롬은 꼭 공용 줄(`tools/web/one.py`)로 띄운다.

## 원고 꼴

```python
DECK = {
    "key": "판마다-다른-이름-v1",      # 이어 보기 저장 이름. 판마다 다르게
    "title": "브라우저 탭 제목",
    "internal": "내부용 표시(선택)",     # 첫 장 위 작은 빨간 글
    "lastLabel": "처음으로",
    "images": {"shot1.jpg": "C:/경로/그림.jpg"},   # 그림 장에서 쓰는 이름 → 원본 경로 (폭 640으로 줄여 img/ 에 넣음)
    "copies": {"reply": "복사 단추로 복사될 글"},
    "cast": [{"id": "boss", "label": "박", "name": "박 사장님", "color": "#B7791F", "role": "한 줄 소개"}],
    "chapters": [
        {"no": "1장", "title": "장 이름", "lead": "부제", "min": "40초", "tone": "blue", "cards": [ ... ]},
    ],
}
```

- 첫 장(`no` 없는 장)에는 `start` 카드 하나. 장 색 `tone`: blue · teal · green · amber · rose · violet · indigo · slate.
- 카드 `id`: 영문·숫자·`-_.:` 만. **질문 기능을 켤 판이면 모든 카드에 id를 박는다** — 답 장은 그 id 뒤에 붙는다. id가 없으면 자리 번호(`c장-순서`)라 장을 넣고 빼면 뒤쪽 답이 어긋난다.
- 글 꾸밈: `**굵게**`, `==형광펜==`. 태그(`<b>` 같은 것)는 쓰지 않는다(만들기가 막는다).

### 카드 종류 (`type`, 없으면 scene)

| type | 칸 |
|---|---|
| start | eyebrow, title, body, meta[ ] — 목차·이어 보기가 자동으로 붙음 |
| scene | kicker, title, pic, body — 기본 장 |
| cast | title, ids[ ] (cast의 id), note |
| talk | title, lines[{who, text, label?}] — who가 `me`면 오른쪽 말풍선 |
| list | title, items[ "글" 또는 ["굵은 줄", "작은 줄"] ], style:"ban"이면 ✕ 목록 |
| numbers | title, items[[큰 숫자, 설명]] |
| spine | title, items[[단계, 설명]] — 뼈대 한 장 |
| decide | title, items[{q, options, rec, why}] — 정할 것(선택지·권고·이유) |
| quiz | q, options[2~4], answer(0부터), why, label? — 장 끝 한 문제 |
| end | title, body, note, links — 점수·다시 볼 장이 자동으로 붙음 |

모든 카드에 덧붙일 수 있는 칸: `remember`(기억) · `tip`(요령) · `ban`(이 말은 금지) · `teaser`(다음 장 예고) · `note`(작은 글) · `buttons[{label, href | copy:"copies 이름" | go:카드 순번(0부터)}, primary?]` · `links[{label, href}]` · `more{label?, lines[ "글" 또는 {text, href, link?} ]}`(근거 접기).

### 그림 (`pic`, 하나 또는 목록)

| type | 칸 | 쓰는 곳 |
|---|---|---|
| quote | text, cite | 고객이 한 말 |
| notify | app, title, body, from | 폰 알림 |
| route | from, to, steps[ ], on(지금 칸 번호 또는 목록) | 물건 하나 따라가기 |
| flow | rows[{kind:"money"이면 돈, from, what, via?, what2?, to}] | 돈·물건이 오가는 길 |
| steps | items[[굵은 말, 설명]] | 순서 |
| vs | a[이름, 글 또는 목록], b[이름, 글 또는 목록] | 나란히 비교 |
| fork | top, ok[제목, 글], no[제목, 글] | 갈림길 |
| traps | items[{icon, name, small?}] | 함정 모아 보기 |
| trap | icon, name, sub | 함정 하나 |
| money | top{kind,label,sub,amount}, split[ 같은 꼴 ], foot, eq?, stack? | 값이 갈라지는 길 (kind: vault·good·ship·없음) |
| pay | parts[{pct, amount, when}] | 나눠 받는 돈 |
| price | rows[{name, note, on}] | 들어가는 것·빠지는 것 |
| checks | items[ ] | 번호 붙은 확인 목록 |
| chips | count?, items[ ] | 낱말 묶음 |
| weeks | rows[[기간, 할 일, 덧말?]] | 일정 |
| doors | items[{name, sub?, tag?}], hl? | 여러 갈래 중 고르기 |
| house | roof, doors[ ], shared[ ] | 한 지붕 아래 여러 서비스 |
| blocks | stages[{name, sub, blocks[ ]}], total? | 쌓아 올리는 구성 |
| img | src(images 이름), alt, cap, wide? | 실제 화면·디자인 사진 |

icon: lock · law · app · cards · chat · check · coin · gate · truck · vault.
(pcard · album · search · scan · chat · msgr 은 첫 판(카드 거래소) 전용 그림이다.)

## 자주 걸리는 것

- 장 첫 카드에는 장 머리띠(약 60px)가 붙는다 — 그 카드 글은 더 짧게. 넘침은 대개 여기서 난다.
- quiz 카드에는 remember·teaser 같은 상자가 그려지지 않는다 — 장 끝 예고는 문제 바로 앞 카드에 건다.
- 상자 순서는 remember → tip → ban → teaser → buttons → links → note → more 로 고정이다.
- vs 는 왼쪽(a)을 회색(옛것·틀린 것), 오른쪽(b)을 강조로 그린다 — 둘 다 맞는 비교엔 쓰지 말고 steps·doors 를 쓴다.
- price 는 on: true 인 줄만 진하게, 나머지는 흐리게 그린다 — '들어가는 것 / 빠지는 것'에만. 셋 중 고르기는 numbers 카드.
- doors 작은 그림(house 안, 폰 폭)은 문이 좁아 이름은 두 글자까지.
- route 칸 수는 steps 수를 따른다(2~9걸음).
- check_story.py 는 셋째 인자 크기의 장별 그림만 찍는다(결과이름_shots/크기/). 다른 크기 그림은 셋째 인자를 바꿔 한 번 더 돌린다.
- 점검 도구는 문제를 하나씩 번갈아 틀리게 고른다 — 끝 장 점수가 절반쯤 나오는 게 정상이다.

## 질문 모으기 · 봉인

- `--board 판열쇠`를 주면 판 아래에 **질문**·위에 **질문함**·**물어보기**가 생긴다. 판열쇠는 대시보드에 판을 등록하면 나온다(대시보드 작업 지시의 창구). 없이 만들면 질문 기능 없이 그냥 넘겨 보는 판.
- `--seal-key-file`(32바이트 열쇠, base64url)을 주면 본문을 잠가서 올린다. 판을 등록할 때 같은 열쇠를 넘겨 두면 정해진 사람이 대시보드에 로그인한 브라우저에서만 풀린다. 봉인 판에는 그림 파일을 쓸 수 없다(그림은 잠기지 않아서 만들기가 막는다).
