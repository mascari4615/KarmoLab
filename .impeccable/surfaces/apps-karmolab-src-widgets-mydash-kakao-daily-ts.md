---
version: 1
slug: apps-karmolab-src-widgets-mydash-kakao-daily-ts
primary_target: apps/karmolab/src/widgets/mydash/kakao-daily.ts
related_targets: [apps/karmolab/src/widgets/mydash/kakao-daily.css]
---

# 카톡 정리 읽기 화면

- 사용자 요청: 봇 소식 숨김, 사람 대화 요약, 대화 원문과 근거 연결, 링크 썸네일, 분류 없는 시간순, 여백 축소
- 기존 Dash 확장. 돋움과 밝기별 하늘, 유리 판, 주황 토큰 계승
- 대화 요약, 대화 원문, 링크 미리보기 세 보기. 방, 검색, 정렬 공용
- 봇 링크 기본 숨김과 포함 선택. 원문은 발화자 익명과 연락처 가림, 문자 표식 유지
- 날짜만 있는 옛 자료는 공유 시각 미기록. 시각을 만들지 않음

## Direction contract

THESIS: 링크뿐인 보고서를 사람 대화와 근거 원문까지 읽는 화면으로 확장.

OWN-WORLD: 기존 Dash 폰트, 토큰과 네이티브 조작 유지, 새 그림과 브랜드 없음.

STORY: 요약 읽기에서 해당 원문으로 이동, 링크는 시간순 미리보기. 필요할 때 봇 포함.

FIRST VIEWPORT: 짧은 날짜 줄과 수치, 방과 정렬과 검색, 세 보기 탭, 첫 실제 논의. 처리 내역은 아래 접기.

FORM: 사용자 지정 기존 표면 확장, code-led. 새로운 컨셉 추첨 대상 아님.

FINISH: 독립 검토와 문서 대조, 실제 배포 확인. 기존 authority 유지, 새 shipping raster 없음.

## 검토

- 최초 fix: 요약 공용 정렬이 무효. 근거 최소 at 기준 전체 방 시간순과 최근순 정렬, conversation/topic 인덱스로 원문 연결
- 수정 verdict ship, P1 resolved. 1440/390/320/dark 가로 넘침과 pageerror 0, 입력 44px
- 요약과 원문, 봇 토글, 시간순과 최근순, 검색, 원문 추가, 터치 확인
- 그림 수는 메타데이터와 DOM 수. 전체 로드 성공 주장 없음, 실패하면 제목과 설명 유지
- 별도 문서 검토 PASS. 기존 tokens와 세 보기, 원문 읽기 계약 일치
