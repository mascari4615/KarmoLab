# Planner Feature History

## 2026-01-15 (KST)

- **플래너 시간 표시기 (Current Time Indicator)**:
    - **실시간 추적**: 스케줄 뷰에 현재 시간을 나타내는 가로 바를 추가하여 직관적인 시간 확인 가능.
    - **UXML 통합**: 표시 바를 `MainView.uxml`에 정적으로 정의하여 UI Builder 편집성과 런타임 성능 개선.
    - **호환성 수정**: 유니티 USS 미지원 속성(`z-index`, `pointer-events`)을 제거하고 `picking-mode` 및 계층 구조로 대체하여 에디터 경고 해결.

- **플래너 및 시스템 개선**:
    - **가독성 최적화**: 일정 블록의 텍스트 레이아웃을 통일하고, 툴팁 간섭 방지를 위해 내부 요소의 `pickingMode` 조정.
    - **시간 표시기 (Current Time Indicator)**: 실시간으로 현재 시간을 추적하여 스케줄 뷰에 가로 바 표시 (초 단위 동기화).
    - **테마 시스템**: `ThemeTokens.uss` 기반의 토큰 시스템 도입 및 리플렉션을 활용한 스마트 테마 전환 로직 구현.
    - **UI 구조 모듈화 (UXML Modularization)**: 거대해진 `MainView.uxml`을 기능별로 분리 (`DashboardView`, `ScheduleView` 등).
    - **스타일 모듈화 (USS Modularization)**: `MainStyle.uss`에서 각 기능별 스타일 분리.
    - **C# 데이터 및 로직 모듈화**: `KarmoToysData` 내에 뭉쳐있던 `PlannerData` 분리 및 마이그레이션 구현.

## 2026-01-14 (KST)

- **코드 품질 및 시스템 안정화**:
    - **토스트 시스템 개선**: UI 스케줄러 도입 및 렌더링 순서 수정.
    - **사용자 경험(UX)**: 앱 실행 시 환영 인사 추가.

- **KarmoToys 아키텍처 리팩토링**:
    - `KarmoLab` -> `KarmoToys` 네임스페이스 변경.
    - `IFeature` / `FeatureBase` 도입.
    - **Planner Fixes**: DetailPopup UI 위치 수정, 반복 일정 파싱 로직 수정, 데이터 무결성 저장 로직 수정.

- **코드 정리 및 프로젝트 구조 통합**:
    - 레거시 코드 제거 (`Assets/Module/Planner/PlannerController*.cs` 삭제).
    - 불필요한 주석 및 디버그 로그 제거.
    - **반복 일정 편집 버그 수정**: 블록 생성 시 필드 누락 문제 및 요일 토글 리셋 문제 수정.

## 2026-01-13 (KST)

- **반복 일정 시스템 (Recurring Events)**:
    - 데이터 모델 도입 (`RecurrenceRule`), 스마트 편집(This Event/All Future) 구현.
    - 버그 수정: None 규칙 시 블록 사라짐 해결.

- **드래그 앤 드롭 고도화 & 리사이즈**:
    - 조작감 개선 (Offset 유지), 반복 일정 지원, No-Op Check 최적화.

- **UX/안정성**:
    - 취소 로직 강화, 전체 수정 경험 정립.

- **반복 일정 고도화 (Weekly)**:
    - 요일 선택 기능, Daily/Monthly/Yearly 통합, 반복 기간 표시.
    - 데이터 무결성 강화 (입력 유효성 검사, 자동 날짜 보정).
    - 스마트 편집 개선.

## 2026-01-12 (KST)

- **Planner UI 개선**:
    - 스케줄 블록 고도화 (동적 레이아웃), UX 강화 (커스텀 툴팁), 안정성 (우클릭 이벤트) 개선.

- **일정 관리 기능 확장**:
    - 휴지통(Trash) 시스템 도입 및 UI 추가.
