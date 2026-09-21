---
title: Claude Artifact
description: "일반 HTML 과 다른 점, 상태 관리 네 층, 타입, 투표와 결정 트래커 같은 용례"
date: "2026-09-21T20:20:00+09:00"
categories: [컴퓨터, 소프트웨어]
tags: [Claude, Artifact]
image: /assets/img/background/kururu-lab.jpg
board: info
---

Claude Code 에서 만들어 claude.ai 에 발행하는 페이지, Artifact 정리. 2026-09-21 runtime contract 0.2.52 기준.

## 한 줄

호스팅된 HTML 이 아니다. 계정, 공유 DB, 실시간 채널, 커넥터, Claude 호출이 붙은 HTML.

정적 페이지면 GitHub Pages 가 낫다. 사람들 입력이 쌓이고 Claude 가 그걸 다시 읽어야 하는 페이지면 Artifact 가 낫다.

## 일반 HTML 과 다른 점

| 항목 | 일반 HTML (GitHub Pages 등) | Artifact |
| --- | --- | --- |
| 배포 | 빌드, push, DNS | 도구 호출 한 번. URL 고정. 재발행하면 열린 화면도 갱신 |
| 접근 제어 | 직접 구현 | claude.ai 로그인. 기본 비공개, 조직 내 공유, 뷰어와 편집자 권한 내장 |
| 누가 보는지 | 모름 | `user` 로 id, 이름, 소유자 여부. 같은 조직 사람만 |
| 서버 상태 | 백엔드와 DB 운영 | `db` JSON 문서 저장소 내장. 백엔드 코드 0줄 |
| 실시간 | WebSocket 서버 | `room` 으로 지금 열어 둔 사람끼리 presence 와 이벤트 |
| 외부 데이터 | API 키를 페이지에 못 넣음. 프록시 필요 | `mcp` 로 뷰어의 커넥터 (Gmail, Calendar, Drive) 를 뷰어 자격으로 호출. 토큰 노출 없음 |
| AI 호출 | API 키와 과금 서버 | `sample` 로 페이지가 Claude 에게 직접 질문. 비용은 뷰어 부담 |
| 댓글 | 외부 위젯 | 셸에 스레드 내장. Claude 가 읽고 답함 |
| Claude 가 다시 읽기 | 불가. 사람이 복사해 와야 | `ArtifactData` 도구로 DB 행을 세션에서 직접 읽고 씀 |
| 외부 스크립트 | 자유 | CSP. cdnjs, jsdelivr, Google Fonts 만. 외부 `fetch` 전부 차단 |

마지막에서 두 번째 줄이 핵심 차이. 사람이 페이지에서 고르면 다음 세션의 Claude 가 DB 를 읽고 그대로 작업한다. 채팅 복붙 단계가 사라진다.

## 배포 인프라가 있어도 쓸 자리

- 사람 입력이 쌓이는 페이지. 투표, 체크리스트, 트래커. 백엔드 없이 만든다
- Claude 가 결과를 이어받는 페이지
- 로그인 데이터를 보여 주는 페이지. 뷰어 본인의 Calendar, Gmail 을 자기 자격으로. 서버에 토큰 저장 안 함
- 일회성 공유. 시안 고르기, 회의 전 의견 수집. Pages 에 올리기엔 수명이 짧은 것

안 맞는 자리. 공개 사이트, SEO, 외부 API 를 페이지에서 직접 부르는 앱, 16MB 넘는 자산, 조직 밖 사람과 이름 붙은 협업.

## 상태 관리는 네 층

어디에 두느냐가 누가 보고 얼마나 오래 남는지를 정한다.

| 층 | 누가 | 얼마나 | 용도 |
| --- | --- | --- | --- |
| `localStorage` | 나 혼자, 이 브라우저 | 브라우저 데이터 지울 때까지 | 탭 위치, 접힌 섹션, 보내기 전 초안. 비공개창이면 비어 있으니 try/catch. Claude 는 못 읽음 |
| `artifact` | 편집자 전원 | 영구. 페이지 자체가 기록 | 상태를 HTML 에 박아 재발행. 열린 화면 전부 새 판으로. 작은 체크리스트, 사인업 시트. 동시 편집은 마지막 발행이 이김 |
| `db` | 조직 내 뷰어. 쓰기는 편집 권한자 | 영구. 서버 | `db.collection("votes").where().onSnapshot()`. 뷰어별 비공개 경로 `data/users/<id>/`. 트랜잭션 없음, last-writer-wins, 단일 작성자 lease 있음. Claude 가 `ArtifactData` 로 읽고 씀 |
| `room` | 지금 열어 둔 사람 | 안 남음. 유실 가능 | 커서, 현재 슬라이드, 반응. 나중에 들어온 사람이 봐야 할 건 db 로 |

고르는 법. 나만 볼 편의면 localStorage, 페이지가 곧 기록이고 편집자 몇 명이면 artifact, 행이 쌓이거나 Claude 가 읽을 거면 db, 순간이면 room.

## Artifact 타입

HTML 대신 타입에서 시작하면 데이터만 넣는다. 지금 계정에 네 종류.

| 타입 | 무엇 | 언제 |
| --- | --- | --- |
| Docs | 같이 읽고 고치는 문서. 본문은 Claude Docs 서비스에, Artifact 는 뷰어 | 계획, 메모, 브리프. 댓글로 Claude 호출 |
| Slides | 16:9 덱. pptx 와 PDF 내려받기 | 발표 |
| Design | 아트보드 캔버스 | 화면 시안, 포스터, 와이어프레임 |
| Design System | 토큰, 컴포넌트, 자산 한 페이지 | 코드베이스에서 뽑아 두면 다른 에이전트가 읽음 |

그 외는 전부 HTML. 위 네 층과 커넥터는 HTML Artifact 에서 쓴다.

## 용례별 조합

| 시나리오 | 조합 | 동작 |
| --- | --- | --- |
| 실시간 투표, 우선순위 | db, user, room | 표는 db 행. 사람당 1행, id 로 중복 차단. 집계는 `onSnapshot` 으로 전원 화면에 즉시. room 은 지금 몇 명 보는지 표시용 |
| 발표 전 의견 수집 | db, comments | 구조화된 답 (동의, 반대, 점수) 은 db, 자유 의견은 셸 댓글. 발표 직전 Claude 가 전부 읽고 요약해 슬라이드로 |
| 결정 트래커 | db, user | 결정, 근거, 결론 메모를 행으로. 누가 언제. 다음 세션 Claude 가 지난 결정을 페이지 안 열고 답함. 사람은 페이지에서, Claude 는 도구로 같은 행 편집 |
| 데이터 실시간 불러오기 | mcp | `watchTool("Google Calendar", "list_events", ...)`. 캐시 재생 뒤 오래되면 갱신, 폴링 간격 지정. 뷰어 자격 |
| 페이지가 Claude 에게 묻기 | sample | 의견 30개 세 줄로 요약 같은 버튼. 스트리밍, tool 도 줄 수 있음. 뷰어 과금, 첫 호출에 동의창 |
| 파일 붙이기, 내려받기 | assets, downloads | 이미지와 PDF 를 20MiB 까지 올려 db 행에 id 저장. 내려받기는 `downloads.save` 만. `<a download>` 는 샌드박스가 막음 |

## 주의

> [!WARNING]
> CSP 가 제일 큰 벽. 외부 `fetch`, 이미지, CSS 전부 차단. 라이브러리는 cdnjs UMD 만. 그림은 data URI 로 박아야 해서 16MB 상한에 금방 닿는다. 그래서 목업은 로컬 HTML 을 기본으로 두고, Artifact 는 요청이 있을 때만 쓴다.

- `db` 는 트랜잭션 없음. 카운터는 행 수로 세고, 합계를 한 문서에 안 쓴다
- `user` 는 같은 조직만. 이름은 저장하지 말고 id 만. 이름은 렌더 때마다 `profiles()`
- `room` 은 권위 없음. 누구나 presence 를 쓸 수 있으니 판정은 db 로
- `mcp` 와 `assets` 를 선언하면 공개 링크 공유 불가. 조직 내부 전용
- `sample` 은 뷰어 지갑. 클릭에만 부르고 루프 금지
- 권한 거절은 오류가 아님. 그 기능만 숨기고 페이지는 살아 있어야
- 재발행 때 `capabilities` 를 빼면 유지, `{}` 면 전부 회수, 일부만 다시 적으면 나머지 회수

## 여기서 쓸 자리

- 시안 고르기 판. 지금은 HTML 을 커밋하고 브라우저로 여는데, db 를 붙이면 좋다 싫다가 행으로 남고 Claude 가 바로 읽는다. 단 그림은 data URI 필수
- 결정 트래커. 변경 문서의 결정 표를 db 로. 폰에서도 적고, 세션 시작 때 Claude 가 읽는다
- Design System 타입. KarmoLab 토큰을 한 번 뽑아 두면 디자인 스킬이 참조
- 안 맞는 것. KarmoLab 본체 (공개 Pages), 오락실 (자산 크기), 서버 모니터 (외부 fetch)

## 메모

- 근거는 Claude Code 세션의 `artifact-capabilities` 스킬 (runtime contract 0.2.52) 과 타입 목록 실측. 계정마다 켜진 capability 와 타입이 다르다
- `self` 는 `artifact` 의 옛 이름. 새 페이지에서는 안 쓴다
