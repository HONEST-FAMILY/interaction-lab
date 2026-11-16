# 자동게시 도구 (포트폴리오 · 월간 어니스트)

대시보드 라이브러리 **'자동게시 - 포트폴리오'**, **'자동게시 - 월간어니스트'** 가 쓰는 도구 모음이다.
처음 만든 곳: 대시보드 이슈 #2009 (포트폴리오 = 맥적, 월간 어니스트 1편 = 춘천 애니메이션 박물관).

헤드리스 크롬을 띄우는 명령은 전부 공용 줄로 돌린다: `python C:/project/interaction-lab/tools/web/one.py <명령…>`
(설치된 크롬 `channel="chrome"` + `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`)

## 순서 한눈에

| 단계 | 도구 | 결과 |
|---|---|---|
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
- 마무리 '의뢰하고 싶다면?' 은 `ASK()` 그대로 쓴다(대표 공용 네 문장 + 아웃트로 그림).

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
