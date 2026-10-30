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
