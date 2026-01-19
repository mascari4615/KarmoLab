# KarmoLab Project History

## 2026-01-19 (KST) - Phase 2 Completion

- **UI 구조 전면 개편 (UI Overhaul - Sidebar Layout)**:
  - **좌측 사이드바 네비게이션**: 기존 상단 탭(Tab) 방식을 모던한 좌측 사이드바(Icon-based Sidebar) 형태로 전면 교체하여 작업 공간 효율성 증대.
  - **헤더/툴바 최적화**: 날짜, D-Day, 컴패니언 토글 등을 상단 `.top-bar`로 재배치하여 정보 밀도와 가독성 개선.
  - **공통 컴포넌트 표준화**: 스크롤바(Overlay Ghost Scrollbar), 리스트 아이템(`.common-list-item`) 등 전역 UI 요소의 스타일을 통일.

- **테마 시스템 아키텍처 재설계 (Theme System Re-engineering)**:
  - **Single Source of Truth**: 모든 스타일 토큰을 `ThemeTokens.uss`로 일원화하고, `MainStyle.uss`에서 이를 참조하는 명확한 의존성 구조 확립.
  - **Absolute Path Imports**: `project://database/...` 절대 경로를 사용하여 Unity USS 로드 시 컨텍스트에 따른 변수 참조 실패(NRE) 문제를 원천 차단.
  - **Black-on-Black Fix**: 루트 컨테이너에 명시적 텍스트 색상 상속(`color: var(--color-text-main)`)을 적용하여 다크 모드 시인성 문제 해결.

- **안정화 및 최적화 (Stabilization)**:
  - **Critical NRE Hotfix**: `StyleVariableResolver` NRE를 유발하던 불필요한 인라인 스타일(`style="color: var(...)"`) 중복 정의를 제거하여 파서 안정성 확보.
  - **Hot Reload 안전성**: UXML/USS 리로드 시에도 깨지지 않는 견고한 Import 구조 완성.

- **Project Manager 아키텍처 고도화 (Refactoring & Architecture)**:
  - **단일 책임 원칙(SRP) 적용**: 거대해진 `ProjectManagerFeature` 클래스를 기능별 Partial Class(`Table`, `Kanban`, `Modal`)로 분리하여 유지보수성 및 가독성 대폭 향상.
  - **One Data, Multi-View 패턴**: `ProjectItemData` 단일 소스를 공유하며 테이블/칸반 뷰가 실시간으로 동기화되도록 설계.

- **사용자 경험(UX) 심화 구현 (Table & Kanban Enhancements)**:
  - **Table View**:
    - **Inline Edit**: 테이블 셀 클릭 시 상태(Status) 및 우선순위(Priority) 즉시 순환 변경 기능.
    - **Sorting & Filtering**: 헤더 클릭 시 다중 정렬 및 검색어 필터링 지원.
  - **Kanban View (Trello 벤치마킹)**:
    - **Visual Refinement**: 우선순위 색상 띠(Color Strip) 및 태그 칩(Tag Chips) 시각화 적용.
    - **Drag & Drop**: 고스트 아이콘 트래킹 및 영역 판정 로직 개선으로 부드러운 이동 경험 제공.
    - **Quick Add**: 각 컬럼 하단에 빠른 추가 버튼 배치.

- **인터랙션 및 UI 최적화**:
  - **Context Menu (우클릭 메뉴)**: 테이블 행 및 칸반 카드 우클릭 시 이동/아카이브/삭제 메뉴 제공.
  - **Compact Toolbar**: 상단 대형 헤더를 제거하고, 검색창과 뷰 전환 버튼을 포함한 슬림 툴바를 도입하여 작업 공간(Workspace) 확보.
  - **Runtime Optimization**: 커서 관련 런타임 경고 해결 (`cursor: link` 제거).

## 2026-01-18 (KST) - Part 4

- **UI 최적화 및 기능 통합 (Feature Consolidation)**:
  - **불필요 피처 제거**: `QuestBoardFeature`와 `NoteFeature`를 제거하여 UI 복잡도를 낮추고 메인 탭 구조를 간소화함.
  - **프로젝트 관리 중심 개편**: 분산되어 있던 할 일 및 기록 기능을 `ProjectManagerFeature` ("프로젝트 관리" 탭)로 통합하여 집중도 향상.
  - **네비게이션 정비**: `MainView.uxml`에서 퀘스트 보드와 비밀 노트 탭을 삭제하고, 전체적인 레이아웃을 다시 정렬함.

## 2026-01-18 (KST) - Part 3

- **설정(Preferences) UI 고도화 및 데이터 관리 강화**:
  - **UI 스타일 최적화**: 인라인 스타일을 `PreferencesStyle.uss` 클래스 기반 스타일로 완전히 이관하여 런타임 안정성 및 유지보수성 확보.
  - **백업 관리 강화**: 각 백업 항목에 개별 삭제(🗑️) 버튼을 추가하고, 실수 방지를 위한 **확인 팝업 오버레이** 시스템 구축.
  - **레이아웃 개선**: 비교 결과(Diff Result) 영역을 리스트 상단으로 이동하여 백업 선택 시 즉각적인 시각 피드백 제공.
  - **리스트 가시성**: 백업 아이템에 배경색 및 호버 효과를 적용하여 스크롤 뷰와의 시각적 구분 명확화.

- **아이콘 버튼 전역 표준화 (Icon Button Standardization)**:
  - **공통 스타일 정의**: `MainStyle.uss`에 `.btn-icon-item` 클래스를 정의하여 프로젝트 전역 표준 아이콘 버튼 스타일 수립.
  - **일관된 피드백 적용**: 메인 헤더(컴패니언, 테마 토글) 및 피처 내 아이콘 버튼들에 동일한 호버 피드백 및 트랜지션 적용.
  - **UX 최적화**: 마우스 아웃 시 색상이 어색하게 어두워지는 현상을 방지하기 위해 기본 밝기를 상향하고 배경 위주의 피드백으로 정교화.

- **백업 감지 로직 정교화 (DataService Update)**:
  - **ProjectItems 감지**: `ProjectItemData`의 상태, 제목, 내용 변화를 감지하여 백업 트리거 조건에 포함.

## 2026-01-18 (KST) - Part 2

- **전역 명시적 타입 리팩토링 (Global Explicit Type Refactoring)**:
  - **`var` 제거**: `Assets/KarmoToys` 내의 모든 C# 파일에서 `var` 키워드를 제거하고 명시적 타입 선언으로 교체. 코드의 의도를 명확히 하고 IntelliSense 가독성 향상.
  - **데이터 모델 정합성 확보**: 리팩토링 과정에서 발견된 `KarmoToysData.cs` 내의 `PlannerData` 중복 정의를 제거하고 `ScheduleData`로 단일화.
  - **네임스페이스 충돌 해결**: `TodoItem`, `TimeBlock` 등 여러 곳에 정의된 타입들에 대해 Fully Qualified Name(완전한 타입 이름)을 사용하여 컴파일 모호성 제거.

- **PlannerFeature 복구 및 코드 정규화 (PlannerFeature Recovery)**:
  - **소실 코드 복구**: 파일 손상으로 유실되었던 `PlannerFeature.Schedule.cs`의 핵심 로직(블록 드래그, 리사이징, 렌더링 시스템)을 Git 복구 및 재구성을 통해 완전 정상화.
  - **빌드 오류 완전 해소**: 리팩토링 후 발생한 모든 컴파일 에러(CS0103, CS0104, CS0029 등)를 해결하여 `Assembly-CSharp.csproj` 빌드 성공(Error 0) 달성.

## 2026-01-18 (KST)

- **인코딩 표준화 및 복구 (Encoding Standardization & Recovery)**:
  - **문자열 복구**: AI 수정 과정에서 깨진 `CompanionFeature.cs`의 설정 아이콘(`⚙️`) 및 기타 유니코드 문자열 복구.
  - **인코딩 가이드 수립**: `Encoding_Policy.md`를 작성하여 모든 프로젝트 파일의 인코딩을 **UTF-8 with BOM**으로 고수하도록 규정.
  - **원인 분석**: AI 도구의 기본 인코딩(UTF-8)과 윈도우 환경(UTF-8 BOM) 간의 불일치 문제를 파악하고 방지 대책 마련.

- **컴패니언 관리 체계 전면 개편 (Companion Management)**:
  - **진입점 중앙화**: `ToolBox`에 흩어져 있던 컴패니언 실행 로직을 `KarmoToysApp` 및 `CompanionService`로 중앙 집중화.
  - **자동 실행 (Auto-Launch)**: 메인 프로그램 실행 시 컴패니언 프로세스를 자동으로 함께 소환하여 편의성 증대.
  - **실시간 토글 UI**: 헤더 상단에 컴패니언 소환/해제 전용 버튼 버튼 추가 및 가로형 툴바(Horizontal Toolbar) 레이아웃 적용.

- **확장형 모드 시스템 도입 (Scalable AppMode)**:
  - **Enum 기반 모드 관리**: `bool` 기반의 체크 방식을 `AppMode` Enum(`Main`, `Companion`)으로 전환. 향후 위젯, 집중 모드 등 새로운 실행 모드 추가를 위한 기반 마련.
  - **모드별 독립 뮤텍스**: 실행 모드에 따라 `Global\KarmoLab_{Mode}` 형태의 독립적인 뮤텍스를 생성하여 프로세스 간 간섭 방지 및 단일 인스턴스 보호 강화.

- **서비스 지향 아키텍처 리팩토링 (Service-Oriented Refactor)**:
  - **플랫폼 로직 격리**: OS 레벨 API(Mutex, Process)가 포함된 지저분한 코드를 `AppLauncher`와 `CompanionService`라는 독립된 서비스 클래스로 분리.
  - **DX(Developer Experience) 개선**: 전처리 심볼(`#if`)로 인해 에디터에서 인텔리센스가 비활성화되던 문제를 '메서드 내부 분기' 방식으로 해결하여 100% 코드 완성 및 에러 체크 지원.
  - **코드 다이어트**: `KarmoToysApp.cs` 본체에서 시스템 의존성을 제거하고 핵심 앱 흐름에만 집중하도록 정제.

## 2026-01-15 (KST)

- **테마 시스템 고도화 (Theme System)**:
  - **Style Tokenization**: `ThemeTokens.uss` 파일을 신규 생성하여 색상 및 수치 변수를 중앙 관리. 테마 확장성 대폭 강화.
  - **Enum 기반 관리**: `Define.AppTheme` Enum을 도입하여 테마 관리의 타입 안정성 및 데이터 정합성 확보.
  - **리플렉션 기반 테마 전환**: `System.Reflection` 및 `Enum` API를 활용하여 새로운 테마 추가 시 코드 수정 없이 자동으로 인지하고 순환(Dark -> Light -> ...)하는 스마트 전환 시스템 구축.
  - **설정 보존**: 선택한 테마가 `KarmoToysData`에 저장되어 앱 재시작 시에도 유지되도록 구현.

- **UI 서비스 아키텍처 리팩토링**:
  - **Core 네임스페이스 통합**: `ToastService`와 `TooltipService`를 `KarmoToys.Core` 네임스페이스로 이동하여 핵심 서비스 레이어 정립.
  - **전역 툴팁 시스템**: UI Toolkit의 내장 `tooltip` 속성을 감지하여 별도의 설정 없이도 런타임 툴팁을 표시하는 범용 서비스 구축.

- **백업 시스템 대규모 개편 (Backup System v9)**
  - **지능형 백업 트리거 (Deep Modification Detection)**: 단순 개수 변화뿐만 아니라, `TimeBlock` 시간/제목, `TodoItem` 완료 여부/내용, `SecretNote` 상세 내용 변경까지 완벽 감지.
  - **누적 변경 감지 (Cumulative Tracking)**: 마지막 저장 시점이 아닌, **마지막 백업 파일**과 비교하여 변경 사항 누적 카운트. 임계치(Change Threshold) 도달 시 백업 수행.
  - **안전장치 (Fallback)**: 백업 파일 부재 시 즉시 초기 백업 생성. (InitBackup)
  - **구조 단순화 (Flat Structure)**: `Backups/{SaveId}/` 형태를 `Backups/` 단일 폴더로 통합.
  - **중복 방지**: MD5 해시 체크로 내용 동일 중복 백업 생성 원천 차단.

- **설정 탭 분리 (Preferences Refactor)**
  - **탭 분리**: 기존 `ToolBox`에 섞여 있던 앱 설정(테마, 백업 등)을 독립된 **Preferences(설정)** 탭으로 분리하여 UI 구조 개선.

## 2026-01-12 (KST) ~ 2026-01-13 (KST)

- **디버그 및 데이터 관리 (Debug & Data)**:
  - **Data Management UI**: [도구] 탭에 데이터 관련 유틸리티 섹션 추가.
  - **Open Save Folder**: `savedata.json` 저장 경로를 원클릭으로 탐색기에서 열람.
  - **Refresh Data**: 외부 수정된 데이터를 런타임에 즉시 재로드하여 반영 (Hot Reload).

- **개발 환경 최적화 (DX)**:
  - **VS Code Workspace**: 프로젝트 권장 확장 프로그램 목록(`.vscode/extensions.json`) 구성.

## 2026-01-09: Tools Integration & Refactoring

### 1. Refactoring

- **Controller Partitioning**: `PlannerController.cs` became too large, so it was split into `partial` classes.

### 2. Tools Integration

- **Objective**: Integrate legacy utilities (from `Assets/Scripts/Content`) directly into the Planner UI.
- **ITool Architecture**: Created `ITool` interface to standardize tool behaviors.
