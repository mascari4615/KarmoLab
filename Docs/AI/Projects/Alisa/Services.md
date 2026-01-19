# Alisa PM 서비스 목록 (Service Menu)

Summary: Alisa가 제공하는 프로젝트 관리 서비스 목록.

**Alisa**가 제공하는 프로젝트 관리 서비스의 상세 목록임.
필요한 업무가 있다면 이 메뉴를 참고하여 명확히 지시할 것.

## 1. 📅 일정 및 작업 관리 (Schedule & Task Management)

- **로드맵 관리 (Roadmap Mgmt)**
  - `Docs/Product/Roadmap.md`의 거시적 목표와 마일스톤을 최신 상태로 유지함.
  - 진행 상황에 따라 일정 조정 제안.

- **백로그 정제 (Backlog Grooming)**
  - `Docs/AI/Global/Backlog.md`에 쌓인 아이디어를 구체화하고 우선순위 정렬.
  - 모호한 요구사항을 명확한 '할 일(Action Item)'로 변환.

- **스프린트 관리 (Sprint Planning)**
  - 단기 목표 설정 및 `SprintLog.md` 작성/갱신.
  - 작업 완료 후 회고(Retrospective) 진행 및 개선점 도출.

## 2. 📝 문서화 및 지식 관리 (Documentation & Knowledge)

- **히스토리 기록 (History Logging)**
  - 주요 기능 구현 완료 시 `History.md`에 작업 내역을 요약하여 기록.
  - 단순 커밋 로그보다 더 읽기 쉬운 형태로 "무엇을, 왜 변경했는지" 남김.

- **규칙 감시 (Standard Compliance)**
  - `Docs/Standards/`의 규칙(네이밍, 마크다운 등)이 잘 지켜지고 있는지 감시.
  - 위반 사항 발견 시 수정 제안.

- **회의록 작성 (Meeting Notes)**
  - 사용자와의 주요 논의 내용을 `MeetingNotes.md`에 요약 정리.
  - 결정된 사항(Decision)을 명확히 박제함.

## 3. 🏗️ 아키텍처 및 설계 (Architecture & Design)

- **설계 문서 작성 (Blueprint/Spec)**
  - 구현 에이전트가 코드를 작성하기 전, 참조해야 할 **'기획서'** 또는 **'기술 명세서'**를 작성.
  - 기능의 요구사항, 데이터 구조, 예외 처리 방침 등을 미리 정의하여 구현 단계의 시행착오를 줄임.

- **코드 리뷰 (Code Review)**
  - PM 관점에서 코드의 유지보수성, 가독성 검토.
  - 설계 의도에 맞게 구현되었는지 냉철하게 확인.

## 4. 🛠️ 자동화 도구 (Automation Tools)

- **문서 규준 검사기 (Compliance Checker)**
  - `Docs/AI/Projects/Alisa/Tools/CheckMarkdownCompliance.ps1`
  - 모든 프로젝트 문서가 공식 컨벤션을 준수하는지 자동 검사함.
  - `/check-compliance` 커맨드와 연동되어 작동함.
