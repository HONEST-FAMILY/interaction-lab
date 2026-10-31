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
준비: Python 3, `pip install playwright pillow`, 크롬 설치(헤드리스는 `channel="chrome"`으로 설치된 크롬을 쓴다). 영상 프레임이 필요하면 ffmpeg.

| 할 일 | 명령 | 보는 것 |
|---|---|---|
| 미리보기 서버 | `python tools/web/serve.py 8526 <사이트 루트>` | 헤드리스 여러 개가 동시에 붙어도 끊기지 않는 서버(`python -m http.server`는 동시 접속 때 CSS가 끊긴다) |
| 전체 캡처 | `python tools/web/fullshot.py <주소> <출력접두> 1440 900 24` → `python tools/web/sheet.py "<출력접두>_*.jpg" <모아보기.jpg> 6 330` | 화면 단위로 끝까지 내리며 캡처 + 콘솔 오류 |
| 움직임 녹화 | `python tools/web/rec.py <주소> <시트.jpg> 1440 900 <steps.json> 4.5 18` | CDP 스크린캐스트를 시간 라벨 붙은 시트로. steps 예: `[["wait",1500],["scroll",300],["move",700,450,10],["down"],["up"],["click",x,y],["sel","#menu"],["js","window.scrollTo(0,3000)"]]` |
| 폭 9개 | `PYTHONIOENCODING=utf-8 python tools/web/widths.py <주소> --out <폴더>` | 390·412·768·980·1024·1280·1440·1920·2560 가로 넘침·글자 가림·콘솔. '밖으로 나감'은 가로 레일이면 정상, 앱바 밑을 그 순간 지나가던 글자도 정상 |
| 배너 아래 디자인 관문 | `python tools/web/sections.py <urls.json> <결과.json>` (urls.json = `[["이름","주소"], ...]`, 다시 보기는 `--summary <결과.json>`) | 첫 화면 아래 섹션마다 사진·그림 면적, 한 화면당 글자 수, 제목 크기. 관문 기준: 그림 40% 이상, 글자 한 화면 200자 안팎 이하, 제목 크기가 전부 같지 않을 것 |
| 레퍼런스 나란히 | `python tools/web/pair.py <모아보기.jpg> "레퍼런스: 사이트 섹션" <ref.jpg> "우리: N안 섹션" <ours.jpg> [...4개씩 더]` | 배너 아래 섹션마다 '레퍼런스 섹션 | 우리 섹션'을 나란히 한 장으로 — 디자인 관문 판정과 보고 첨부용 |
| 요소별 움직임·렉 | `python tools/motion_check.py <주소> <결과 폴더>` | 섹션별 등장·손 반응·숨은 글·싸구려 신호·CPU 4배 프레임 |
| 폰 렉 재기 | `python tools/web/perf_mobile.py <주소> [- \| idle \| steps.json] [초]` | 폰(390×844·픽셀비 3·터치)+CPU 4배 느리게로 프레임(p90·33ms 넘는 장면 10초당)·레이아웃/스타일 재계산 횟수·'다시 그리는 층' 상위 8개(이름·크기·10초당 횟수). `-`=끝까지 천천히 스크롤, `idle`=가만히 두기, steps=`[["wait",ms],["scroll",dy],["scrollTo",y],["sel",css],["tap",x,y],["press",css],["js",code],["mark"]]`(`mark`=여기부터 재기 — 준비 동작은 빼고 잴 때). 합격: 33ms 넘는 장면 10초당 6번 이하·p90 17ms 이하. '다시 그리기 많음'은 힌트 — 원인을 찾아 일부러 움직이는 것(프레임 애니메이션의 이미지 바꾸기 등 작은 부분)이면 두고, 안 움직이는데 다시 그리면 고친다 |
| 발행 | `python tools/web/publish.py <사이트 루트> <안 폴더…> --dest <프론트 저장소>/public/previews/<이름>-<이슈번호> [--push]` | HTML·CSS·JS에 문자열로 적힌 파일만 골라 담고 주석을 지운다. 밑줄로 시작하는 폴더(`_orig` 등)와 `lab`은 빠진다. `--push`면 dest 아래 같은 이름 폴더를 바꿔 넣는다 |

기준서 틀: `templates/SPEC-common.md`(공통) · `templates/SPEC-site.md`(안마다). 본보기 시안: https://dashboard.honest-family.com/previews/interaction-1526/maekjeok/index.html (`maekjeok-2` · `maekjeok-3` · `museum` · `museum-2` · `museum-3`).

주의: 연결된 일반 크롬 창이 다른 창에 가려져 있으면 requestAnimationFrame이 초당 2번 안팎으로 눌려 움직임이 느리게 보인다. 움직임 판정은 헤드리스 녹화(초당 60장)로 하고, 일반 크롬은 로딩·정지 화면 확인용으로 쓴다.
