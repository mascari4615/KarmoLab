---
version: 1
slug: "apps-karmolab-src-widgets-mydash-kakao-daily-ts"
primary_target: "apps/karmolab/src/widgets/mydash/kakao-daily.ts"
related_targets: ["apps/karmolab/src/widgets/mydash/kakao-daily.css"]
---

---
kind: reference
measured: 2026-10-14
---

# 날짜별 카톡 보고서 설계와 구현 기록

- 사용자 문제: Discord의 긴 URL 나열과 여러 메시지 분할로 읽기 어려움
- 사용자 결정: 하루별 HTML 보고서, 설계 후 진행, KarmoDash 사용 가능
- 채택: 기존 Dash의 모은 것 메뉴에 카톡 정리, 정리 실행일별 영구 주소
- 시안: 날짜 이동, 주제별 제목과 기존 페이지 설명, 방 필터와 검색, 처리 내역 접기
- 별도 HTML 첨부 대신 Dash 패널. 기존 로그인과 비공개 memo 읽기 재사용
- 기존 Open Graph 설명 사용. 새 AI 요약과 임의 중요도 선별 없음
- 정리일과 공유일 구분. 이전 날짜에 공유된 링크도 정리일 보고서에 표시
- 데이터 정본 `data/kakao-daily/YYYY-MM-DD.json`, 목록 `index.json`
- 하루 여러 실행 보존, 같은 startedAt의 재시도는 한 번 저장
- 보고서 원격 반영 확인 뒤 Discord 1개 알림. 실패 시 로컬 큐에 보존하고 다음 호출에서 보고서 저장부터 재시도
- 옛 알림 큐는 기존 cards와 receipts 그대로 처리
- 첫 실입력: `%USERPROFILE%/.karmoddrine/kakao-export/last-report.json`. 대화 내보내기와 삭제 재실행 없음
- 검사: `node --test scripts/kakao/daily-report.test.mjs scripts/kakao/notify.test.mjs`
- UI 캡처와 실제 배포 확인은 구현 후 기록

## Direction contract

THESIS: 날짜별로 읽는 링크 목록. 긴 주소 나열 대신 제목과 원문 출처.

OWN-WORLD: 기존 Dash의 하늘 배경, 유리 판, 돋움과 주황 토큰 계승. 세계관 교체 없음.

STORY: 날짜와 수를 확인하고 제목과 설명을 읽고 원문 열기. 방과 검색으로 좁히기.

FIRST VIEWPORT: 날짜 이동 줄, 날짜 제목과 링크 수, 방과 검색, 첫 주제의 읽기 목록. 처리 내역은 아래 접기.

FORM: 기존 화면의 좁은 확장, Read 모드. 사용자 승인한 한 열 목록, concept-seed 대상 아님.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish evidence

- 기존 Dash 확장. 새 세계관 문서 생성 없음, dash.css와 mydash.css의 기존 토큰과 돋움 계승.
- 실제 39개 링크로 1440, 390, 320과 어두운 화면 확인. 가로 넘침과 pageerror 0.
- 독립 리뷰 최초 fix: 검색 라벨 줄바꿈과 입력 높이. 최종 수정 verdict ship, P2 resolved.
- 검색 입력 실제 높이 44.390625px, 모든 폭에서 검색 한 줄. 방 필터, 검색, 처리 내역 접기, 없는 날짜, 터치 접기 확인.
- 별도 문서 검토: 구현과 계약 일치, 새로운 shipping raster 없음, source contract는 배포 import와 조립 경로에 없음.
