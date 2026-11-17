# 자동게시 도구 (포트폴리오 · 월간 어니스트 · 유지보수일지)

대시보드 라이브러리 **'SNS 게시 - 포트폴리오'**, **'SNS 게시 - 월간 어니스트'**, **'SNS 게시 - 유지보수일지'** 가 쓰는 도구 모음이다.
(라이브러리 이름은 2026-11-17 대표가 확정 — 처음 붙였던 '자동게시 - …' 이름은 버림.)
처음 만든 곳: 대시보드 이슈 #2009 (포트폴리오 = 맥적, 월간 어니스트 1편 = 춘천 애니메이션 박물관).

헤드리스 크롬을 띄우는 명령은 전부 공용 줄로 돌린다: `python C:/project/interaction-lab/tools/web/one.py <명령…>`
(설치된 크롬 `channel="chrome"` + `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`)

## 순서 한눈에

| 단계 | 도구 | 결과 |
|---|---|---|
| 0. 필수 자료 | `find_background.py` (+ 기록은 `project_note.sh`) | 고객 프로젝트 정보에 의뢰 배경이 있는지, 찾아본 곳 한 줄 |
| 1. 대본 데이터 | `examples/2009/script_data.py` 를 복사해 새 편 데이터로 | 장면 → 자료화면 그림 → 말 |
| 2. 원고 대조 | `check_fidelity.py` | 대표 원고 문장이 대본에 글자 그대로 있는지 |
| 3. 대본 페이지 | `examples/2009/build_eps.py` | 편마다 한 페이지 + 자료화면 묶음(zip) |
| 4. 인터랙션 영상 | `rec_smooth.py` + `smooth_check.py` + `encode.py` | hero.mp4 / thumb.mp4 / reel.mp4 와 포스터 |
| 5. 블로그 글 | `examples/2009/build_post.py` → `publish_blog.sh` | honest-family.com/blog 글 (맨 위·썸네일 영상) |
| 6. 네이버 · 인스타 | 라이브러리 노트대로 (크롬 devtools MCP, 로그인은 사람 몫) | 맨 위 영상 글 / 릴스 |

## 1. 대본 데이터

`script_data.py` 한 파일에 편 하나(또는 여러 편)를 적는다. 장면(scene) 안에 박자(beat), 박자 안에 자료화면(shots)과 말(lines).

- `shots`: `[('그림파일.jpg', '그 그림에서 보여 줄 것 한 줄')]` — 그림은 `SHOTS_DIR` 폴더에서 찾는다.
- `lines`: `(N, '말')` 대표가 말하는 문장 / `(C, '자막')` 화면 글자 / `(S, '무음 메모')`.
- 마무리 '의뢰하고 싶다면?' 은 `ASK(가격 자막, 가격 문장…)` 으로 쓴다(대표 공용 네 문장 사이에 그날 가격표 숫자 + 아웃트로 그림). 가격은 대본을 쓰는 날 honest-family.com/price 를 열어 읽은 숫자로 바꾸고(`PRICE_*` 값), 가격표에 적힌 사실만 말한다(누구나 하는 말을 덧붙이지 않는다). 기준 = 라이브러리 대본 틀 노트 '마무리 가격' (2026-11-17 대표 승인).
- 인트로는 인사 앞에 질문 한 문장, 소개 문장 뒤에 미리 알림 한 문장(본보기: 월간 어니스트 1편 `EP1`). 올리기 칸(`package`)의 제목·썸네일·설명란 첫 두 줄·고정댓글 가격도 같은 노트의 '올리기 칸'대로. 맥적 편(`MAEK`)도 같은 틀의 2026-11-17 승인본이다(이슈 #2074).

## 2. 원고 대조

```
python check_fidelity.py 대표원고.txt 대본.txt --fix 고기집=고깃집 --fix 인대요=인데요
```

원고의 말하는 문장마다 대본(자료화면·자막 줄 제외)에 공백·문장부호 무시하고 그대로 들어 있는지 본다. `없음:` 으로 나온 줄은 일부러 바꾼 것(마무리 공용 문장 등)인지 하나씩 확인한다.

## 3. 대본 페이지

```
SHOTS_DIR=그림폴더 SITE_DIR=프론트저장소/public/share/이슈번호 python examples/2009/build_eps.py
```

`build_eps.py` 위쪽의 `HASH`, `SLUG`, `PAGE_TITLE`, `DRAFTS`, `MEMO` 를 새 편에 맞게 바꾼다. 페이지에는 대본만 남는다(바뀐 것, 먼저 읽기, 글씨 색 안내, 내부 확인 같은 메타는 넣지 않는다). 프론트 저장소 master 푸시 = 자동배포.

## 4. 인터랙션 영상

`README_video.txt` 참고. 계획 파일(JSON) 하나에 주소, 화면 크기, 순서(스크롤·멈춤·드래그·탭)를 적으면 프레임 단위로 찍어 버벅임 없는 영상을 만든다. 본보기 계획: `plan_maek2_hero.json`(가로 1920, 60fps), `plan_maek2_reel.json`(휴대폰 세로, 30fps).

파일 이름은 블로그 규칙대로 `hero.mp4 / hero.jpg / thumb.mp4 / thumb.jpg`(인스타는 `reel.mp4 / reel.jpg`)로 바꿔 프론트 저장소 `public/blog-assets/video/(슬러그)/` 에 둔다.

## 5. 블로그 글

```
python examples/2009/build_post.py        # payload json 생성
bash publish_blog.sh payload.json         # 운영 서버에서 브리지 키를 읽어 등록 (키는 화면에 안 나옴)
```

영상 파일은 프론트 저장소 `public/blog-assets/video/(슬러그)/hero.mp4, hero.jpg, thumb.mp4, thumb.jpg`, 본문 그림은 `public/blog-assets/portfolio/(슬러그)/`. 글의 `video_url` 이 `…/hero.mp4` 면 글 맨 위와 목록 썸네일이 영상으로 바뀐다. 같은 `source_key` 로 다시 보내면 같은 글을 고친다.

## 0. 필수 자료 — 의뢰 배경 찾기와 프로젝트 정보 기록

포트폴리오 편은 의뢰 배경(어떤 고객인지 · 왜 홈페이지가 필요했는지 · 일정이나 조건 사정)이 있어야 대본을 끝낸다. 정본은 대시보드 **고객 프로젝트 화면의 '기본 정보' 칸 중 '메모'** 에 붙은 `[의뢰 배경 …]` 덩어리다.

```
python -I find_background.py 맥적 7998          # 브랜드 이름, 실행 번호 (DASHBOARD_API_URL·DASHBOARD_AGENT_TOKEN 환경변수 사용)
```

- 대시보드 대화 수집함 조회(`/agent/conversations/lookup`)로 이름이 맞는 고객 프로젝트 메모를 읽어 `has_background`, 덩어리 원문, 관련 이슈 번호, 그리고 보고에 그대로 붙일 `searched_line`(찾아본 곳 한 줄)을 낸다. 지금 실행 중인 이슈는 조회에서 빠지므로 그 이슈 원문·댓글은 따로 본다.

대표가 의뢰 배경을 주면(또는 다른 이슈에서 찾으면) 고객 프로젝트 메모 끝에 붙인다. 로그인된 크롬(클로드 크롬 확장)이 있으면 화면에서 붙이고, 없으면 이 PC에서:

```
bash project_note.sh show 62 > before.json                        # 지금 메모를 받아 둔다(before_b64 = 원문)
DRY=1 bash project_note.sh append 62 block.txt                    # 미리 보기, 아무것도 안 바뀜
bash project_note.sh append 62 block.txt                          # 끝에만 붙임, 같은 덩어리가 있으면 already
bash project_note.sh restore 62 backup.txt                        # 되돌리기: 받아 둔 원문으로, 그 뒤 다른 수정이 있으면 거절
```

`backup.txt` = `before.json` 의 `before_b64` 를 풀어 그대로 저장한 파일(줄바꿈 바꾸지 말 것).

- `block.txt` 첫 줄 = `[의뢰 배경 · YYYY-MM-DD 대표 작성 — 이슈 #N]`, 다음 줄부터 대표 문장 그대로.
- 운영 서버(`~/.ssh/honest-family.pem`)의 대시보드 백엔드에서 그 프로젝트 `notes` 만 고치고 감사 기록(`project.updated`)을 남긴다. 다른 칸·다른 프로젝트는 건드리지 않는다. 고객 프로젝트가 대시보드에 없으면 만들지 않는다.
- 붙인 뒤 `find_background.py` 를 다시 돌려 `has_background: true` 를 확인한다. 첫 기록: 2026-11-16 맥적 전주본점(#62).
