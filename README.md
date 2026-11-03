# 인터랙션 랩

만지면 반응하는 웹, 여섯 가지 실험 — https://honest-family.github.io/interaction-lab/

| 번호 | 실험 | 기법 | 폴더 |
|---|---|---|---|
| 01 | 한글 파티클 | 입자 물리 · 스프링 · 소용돌이 | `type/` |
| 02 | 수묵 유체 | GPU 유체 시뮬레이션(Stable Fluids) · 흡수형 잉크 표현 | `ink/` |
| 03 | 가야금 | 현 진동 시뮬레이션 · Karplus–Strong 소리 합성 | `strings/` |
| 04 | 깃발 | 3D Verlet 천 시뮬레이션 · 찢어짐 | `cloth/` |
| 05 | 등고선 | 높이장 · 셰이더 등고선 · 지시선 주석 | `contour/` |
| 06 | 떨어지는 글자 | 강체 물리(matter.js) · 기울기 센서 | `drop/` |

## 구조
- 빌드 없음. 실험마다 폴더 하나(`index.html` + `main.js`). 공통 틀은 `assets/lab.css`·`assets/lab.js`.
- 외부 라이브러리는 `lib/` 사본만 쓴다(matter.js, MIT). 글꼴은 Pretendard(CDN).
- `previews/` = 첫 화면 목록의 미리보기 영상(헤드리스 크롬 녹화).

## 검수 도구
- `tools/qa.py` — 헤드리스 GPU 크롬으로 열어 첫 2초와 제스처(원 그리기·탭·끌기·빠르게 긋기·길게 누르기) 중·후 화면을 모아보기로 저장, fps·콘솔 에러·가로 넘침 출력. `--mobile`이면 CDP 터치로 손가락 입력.
- `tools/record.py` — CDP 스크린캐스트로 제스처 시연을 녹화해 mp4(960×600)와 포스터를 만든다.
- `tools/motion_check.py` — 시안 주소를 받아 섹션마다 스크롤 등장·마우스 반응 수, 빨리 내리기·스크립트 끔·움직임 줄이기 때 숨은 글, 3D 기울기·자석 버튼·굴린 숫자(싸구려 신호), CPU 4배로 1440·2560 폭을 스크롤할 때 프레임(p95·50ms 넘는 비율)을 잰다. `python tools/motion_check.py <주소> <결과 폴더> [--perf-only]`

로컬 실행: 저장소 루트에서 `python -m http.server 8458` → http://127.0.0.1:8458/

## 홈페이지 시안 검수·발행 도구 (`tools/web/`) — 라이브러리 「고퀄리티 홈페이지 제작자」와 같이 쓴다
준비: Python 3, `pip install playwright pillow numpy`, 크롬 설치(헤드리스는 `channel="chrome"`으로 설치된 크롬을 쓴다). 영상 프레임이 필요하면 ffmpeg.

| 할 일 | 명령 | 보는 것 |
|---|---|---|
| 미리보기 서버 | `python tools/web/serve.py 8526 <사이트 루트>` | 헤드리스 여러 개가 동시에 붙어도 끊기지 않는 서버(`python -m http.server`는 동시 접속 때 CSS가 끊긴다) |
| 전체 캡처 | `python tools/web/fullshot.py <주소> <출력접두> 1440 900 24` → `python tools/web/sheet.py "<출력접두>_*.jpg" <모아보기.jpg> 6 330` | 화면 단위로 끝까지 내리며 캡처 + 콘솔 오류 |
| 움직임 녹화 | `python tools/web/rec.py <주소> <시트.jpg> 1440 900 <steps.json> 4.5 18` | CDP 스크린캐스트를 시간 라벨 붙은 시트로. steps 예: `[["wait",1500],["scroll",300],["move",700,450,10],["down"],["up"],["click",x,y],["sel","#menu"],["js","window.scrollTo(0,3000)"]]` |
| 폭 9개 | `PYTHONIOENCODING=utf-8 python tools/web/widths.py <주소> --out <폴더>` | 390·412·768·980·1024·1280·1440·1920·2560 가로 넘침·글자 가림·콘솔. '밖으로 나감'은 가로 레일이면 정상, 앱바 밑을 그 순간 지나가던 글자도 정상 |
| 배너 아래 디자인 관문 | `python tools/web/sections.py <urls.json> <결과.json>` (urls.json = `[["이름","주소"], ...]`, 다시 보기는 `--summary <결과.json>`) | 첫 화면 아래 섹션마다 사진·그림 면적, 한 화면당 글자 수, 제목 크기. 관문 기준: 그림 40% 이상, 글자 한 화면 200자 안팎 이하, 제목 크기가 전부 같지 않을 것 |
| 레퍼런스 나란히 | `python tools/web/pair.py <모아보기.jpg> "레퍼런스: 사이트 섹션" <ref.jpg> "우리: N안 섹션" <ours.jpg> [...4개씩 더]` | 배너 아래 섹션마다 '레퍼런스 섹션 | 우리 섹션'을 나란히 한 장으로 — 디자인 관문 판정과 보고 첨부용 |
| 레퍼런스 섹션 실측 | `python tools/web/secmeasure.py <주소> --y <스크롤 위치> --out <접두>` | 그 화면 캡처(.jpg)와 실측표(.md): 글자 크기, 굵기, 행간, 자간, 색, 그림 상자 위치와 크기, 모서리, 그림자, 그림 면적, 글자 수. 레퍼런스와 우리 시안에 같은 명령을 돌려 비교한다. 그림의 질과 역할은 못 잰다 |
| 첫 화면 스크롤 장면 실측 | `python tools/web/scrollprobe.py <주소> --out <접두> [--to 2700] [--w 390 --h 844] [--wait 6000]` | 스크롤 위치마다 요소 크기, 투명도, 확대, 잘라내기, 고정을 재서 '무엇이 몇 px에 시작하고 끝나는지' 표(.md)와 캡처 모아보기(_sheet.jpg)를 만든다. GSAP ScrollTrigger면 시작·끝 px와 고정을 그대로 읽고, 관성 스크롤(Lenis 등) 여부, 캔버스, 영상, 선 그리기 path도 적는다. 레퍼런스 첫 화면 장면을 따라 만들 때 먼저 돌리고, 우리 시안에도 같은 명령을 돌려 비교한다 |
| 같은 스크롤 위치 나란히 | `python tools/web/scrollpair.py <결과.jpg> <레퍼런스 주소> <우리 주소> --at 0,315,630,945,1260 --labels "레퍼런스: 사이트" "우리: N안"` | 두 페이지를 같은 px까지 휠로 내려 줄마다 '레퍼런스 \| 우리'로 붙인다(관성 스크롤이 지나치지 않게 보낸 휠 양으로 맞춘다). 위치는 scrollprobe 표의 시작·끝 px를 넣는다. 장면 길이가 다르면 `--ours-at`. 첫 화면 움직임 판정과 보고용 |
| 고객 그림 크기순 | `python tools/web/assetrank.py <고객 주소> [<주소2> ...] --out <폴더> [--mobile]` | 페이지를 끝까지 내리며 받은 그림(img, srcset, 배경, data-src, og)을 내려받아 큰 순서로 `files/`에 번호를 붙여 저장하고 `assets.csv`와 모아 보기 `sheet.jpg`(투명 그림은 바둑판 바탕)를 만든다. 화면에 작게 보이는데 원본이 훨씬 크면 메모한다. 제품과 사진은 여기서 가장 큰 원본부터 고른다 |
| 기기 렌더에 실제 화면 합성 | `python tools/web/device.py --render <화면이 초록인 렌더.jpg> --screen <실제 화면.png> --out <결과.jpg> [--inset 0.01] [--max 2400]` | 초록(#00FF00) 칸을 찾아 실제 화면을 원근대로 끼우고 둥근 모서리는 초록 모양을 따른다. 화면 밖으로 번진 초록 빛은 지운다(끄려면 --keep-green). 초록 칸이 네 모서리로 잡힐 때만 된다. 본보기 references/prot-1593/phone_render_example.jpg |
| 3단 비교 | `python tools/web/trio.py <결과.jpg> "기존 사이트" <캡처> "레퍼런스: 사이트 섹션" <캡처> "새 시안: N안 섹션" <캡처>` | 섹션마다 기존 사이트, 레퍼런스, 새 시안을 한 장에. 디자인 관문 기록용 |
| 그림 생성 | `python tools/web/gen.py --model gemini-3-pro-image --aspect 16:9 --size 2K --out <파일.jpg> --prompt "..." [--input 원본.jpg]` | 두뇌 서버(ssh 별칭 honest-family)의 Gemini 키로 서버에서 호출하고 그림만 받는다. 키 값은 출력하지 않는다. 결과는 JPEG |
| 헤드리스 한 번에 하나 | `python tools/web/one.py python <도구.py> ...` | 헤드리스 크롬을 쓰는 명령을 잠금으로 줄 세운다(여러 작업자가 동시에 띄워 PC가 느려지는 것 방지) |
| 요소별 움직임·렉 | `python tools/motion_check.py <주소> <결과 폴더>` | 섹션별 등장·손 반응·숨은 글·싸구려 신호·CPU 4배 프레임 |
| 폰 렉 재기 | `python tools/web/perf_mobile.py <주소> [- \| idle \| steps.json] [초]` | 폰(390×844·픽셀비 3·터치)+CPU 4배 느리게로 프레임(p90·33ms 넘는 장면 10초당)·레이아웃/스타일 재계산 횟수·'다시 그리는 층' 상위 8개(이름·크기·10초당 횟수). `-`=끝까지 천천히 스크롤, `idle`=가만히 두기, steps=`[["wait",ms],["scroll",dy],["scrollTo",y],["sel",css],["tap",x,y],["press",css],["js",code],["mark"]]`(`mark`=여기부터 재기 — 준비 동작은 빼고 잴 때). 합격: 33ms 넘는 장면 10초당 6번 이하·p90 17ms 이하. '다시 그리기 많음'은 힌트 — 원인을 찾아 일부러 움직이는 것(프레임 애니메이션의 이미지 바꾸기 등 작은 부분)이면 두고, 안 움직이는데 다시 그리면 고친다 |
| 발행 | `python tools/web/publish.py <사이트 루트> <안 폴더…> --dest <프론트 저장소>/public/previews/<이름>-<이슈번호> [--push]` | HTML·CSS·JS에 문자열로 적힌 파일만 골라 담고 주석을 지운다. 밑줄로 시작하는 폴더(`_orig` 등)와 `lab`은 빠진다. `--push`면 dest 아래 같은 이름 폴더를 바꿔 넣는다 |

기준서 틀: `templates/SPEC-common.md`(공통) · `templates/SPEC-site.md`(안마다). 본보기 시안: https://dashboard.honest-family.com/previews/interaction-1526/maekjeok/index.html (`maekjeok-2` · `maekjeok-3` · `museum` · `museum-2` · `museum-3`).

주의: 연결된 일반 크롬 창이 다른 창에 가려져 있으면 requestAnimationFrame이 초당 2번 안팎으로 눌려 움직임이 느리게 보인다. 움직임 판정은 헤드리스 녹화(초당 60장)로 하고, 일반 크롬은 로딩·정지 화면 확인용으로 쓴다.
