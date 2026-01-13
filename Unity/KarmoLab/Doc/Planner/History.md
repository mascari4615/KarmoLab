# KarmoLab Project History

## 2026-01-12 (KST)

- **Planner UI 개선**:
    - **스케줄 블록 고도화**: 높이에 따른 동적 레이아웃(Row/Column) 적용으로 작은 블록의 시인성 대폭 개선.
    - **UX 강화**: 커스텀 툴팁 도입으로 정보 확인 용이성 확보, 리사이즈/이동 영역 분리(좌/우 50%).
    - **안정성**: 우클릭 컨텍스트 메뉴 이벤트 핸들링 수정 (`PointerDownEvent`).

- **일정 관리 기능 확장**:
    - **휴지통(Trash) 시스템**: 실수 방지를 위한 Soft Delete 방식 도입. 24시간 후 자동 영구 삭제.
    - **UI 추가**: 상단 헤더의 휴지통 아이콘을 통해 삭제된 항목 조회, 복구(Restore), 영구 삭제(Legacy Delete) 가능.

## 2026-01-13 (KST)

- **반복 일정 시스템 (Recurring Events)**:
    - **데이터 모델**: `RecurrenceRule`, `RecurrenceEnd`, `ExceptionDates` 도입 및 데이터 처리 로직 구현.
    - **스마트 편집**: 반복 일정 수정/삭제 시 '이 일정만(This Event)'과 '이후 모든 일정(All Future)' 분기 처리.
    - **버그 수정**: 반복 규칙이 'None'일 때 블록이 사라지는 현상 해결.

- **드래그 앤 드롭 고도화 & 리사이즈**:
    - **조작감 개선**: 드래그 시작 시 블록이 마우스로 점프하는 현상 수정 (Offset 유지).
    - **반복 일정 지원**: 반복 일정도 드래그/리사이즈 가능하도록 업데이트, 종료 시 수정 범위 선택 팝업 연결.
    - **로직 최적화**: 제자리 이동, 크기 미변경 등 무의미한 조작 시 팝업/저장 수행하지 않음 (No-Op Check).

- **UX/안정성**:
    - **취소 로직 강화**: 리사이즈/드래그 도중 취소(Cancel) 버튼 클릭 시 UI 상태 원상복구.
    - **전체 수정 경험**: '이후 모든 일정' 선택 시 기존 시리즈 종료 + 새 시리즈 시작 로직 정립.

- **디버그 및 데이터 관리 (Debug & Data)**:
    - **Data Management UI**: [도구] 탭에 데이터 관련 유틸리티 섹션 추가.
    - **Open Save Folder**: `savedata.json` 저장 경로를 원클릭으로 탐색기에서 열람.
    - **Refresh Data**: 외부 수정된 데이터를 런타임에 즉시 재로드하여 반영 (Hot Reload).

- **개발 환경 최적화 (DX)**:
    - **VS Code Workspace**: 프로젝트 권장 확장 프로그램 목록(`.vscode/extensions.json`) 구성.
    - **코드 구조 개선**: `PlannerController`의 Partial Class 구조 (`Tools`, `Dashboard` 등) 간 충돌 해결 및 통합.
