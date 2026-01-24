# KarmoToys 아키텍처 (Architecture)

Summary: 확장성과 유지보수성을 극대화한 KarmoToys 프로젝트의 모듈형 아키텍처 설계 명세.

## 1. 개요

**KarmoToys**는 기존 `KarmoLab` 모놀리식 구조에서 탈피, 확장성/유지보수성 극대화한 **모듈형 아키텍처** 프로젝트.
`Feature` 단위로 기능을 캡슐화하고, `KarmoToysApp`이 이를 통합 관리.

## 2. 핵심 아키텍처 (Core Architecture)

### 2.1. Feature System

모든 기능(기능 단위)은 독립적인 `Feature` 컴포넌트로 구현.

- **IFeature / FeatureBase**: 모든 피처의 기반 클래스.
  - `Initialize(VisualElement root)`: UI 바인딩 및 초기화.
  - `OnSelect() / OnDeselect()`: 탭 전환 시 활성/비활성 로직.
  - `TabButtonName`: UI 탭 버튼 이름 바인딩.

### 2.2. Main Entry Point

- **KarmoToysApp.cs**: 애플리케이션의 진입점(Entry Point).
  - **Auto-Feature Discovery**: 실행 시(`Awake`) `EnsureFeatures()`를 통해 필요한 Feature 컴포넌트(`Planner`, `Dashboard` 등)가 없으면 **자동으로 GameObject에 추가**.
  - **Settings Integration**: `KarmoToysSettings` (ScriptableObject)를 통해 초기 설정값 주입.
  - **Tab Management**: 등록된 Feature들의 탭 전환을 중앙에서 관리.

### 2.3. Data Management

- **PlannerModel.cs**: 순수 데이터 클래스 (DTO).
- **DataService.cs**: JSON 직렬화/역직렬화 담당.
- **Fail Fast**: UI 바인딩 시 불필요한 Null Check 제거, ID 불일치 등의 문제 런타임에 즉시 발견하도록 설계.

## 3. 기능 모듈 (Features)

### 3.1. Planner (전략 시간표)

- **Class**: `PlannerFeature` (Partial: `Main`, `Schedule`, `Dialogs`)
- **Key Features**:
  - 주간/월간 시간표 시각화.
  - Drag & Drop 일정 생성/수정.
  - 반복 일정(Recurring Events) 지원 (매주/매월/매년).

### 3.2. Dashboard (대시보드)

- **Class**: `DashboardFeature`
- **Key Features**: D-Day, 진행 상황, RPG 스탯 표시.

### 3.3. ProjectManager (프로젝트 관리)

- **Class Structure** (Partial Classes for SRP):
  - `ProjectManagerFeature.cs`: 메인 진입점, 초기화, 뷰 전환 로직.
  - `ProjectManagerFeature.Table.cs`: 테이블 뷰 렌더링, 정렬(Sorting), 필터링, 인라인 편집.
  - `ProjectManagerFeature.Kanban.cs`: 칸반 보드 렌더링, 드래그 앤 드롭(Ghost Icon), Priority Strip.
  - `ProjectManagerFeature.Modal.cs`: 상세 아이템 편집 모달 제어.
  - `ProjectManagerFeature.Whiteboard.cs`: 무한 캔버스 화이트보드 렌더링 및 Pan/Zoom 제어.

- **Architecture Pattern**: **"One Data, Multi-View"**
  - 단일 데이터 소스(`ProjectItemData`)를 공유하며, Table, Kanban, Whiteboard 뷰가 각자의 방식으로 데이터를 렌더링.
  - 데이터 변경 시 `RefreshViews()`를 호출하여 두 뷰를 동시에 갱신.

- **Key Features**:
  - **Inline Editing**: 테이블 셀 클릭으로 즉시 상태/우선순위 변경 (Cycle Logic).
  - **Context Menu**: 우클릭 메뉴를 통한 빠른 이동 및 관리.
  - **Visual Richness**: Trello 스타일의 우선순위 색상 띠, 태그 칩 시각화.
  - **Visual Richness**: Trello 스타일의 우선순위 색상 띠, 태그 칩 시각화.
  - **Compact Toolbar**: 공간 효율성을 극대화한 상단 툴바 레이아웃.

### 3.3.1. Whiteboard Architecture (Coordinate System)

Whiteboard는 **Infinite Canvas** 구현을 위해 데이터 모델과 시각적 표현을 분리하는 **이중 좌표계**를 사용함.

- **Logical Coordinates (Data Layer)**
  - **Center**: `(0, 0)` (논리적 중심).
  - **Storage**: `ProjectItemData.Position`에는 이 논리적 좌표가 저장됨.
  - **Concept**: 무한히 확장 가능한 2D 평면.

- **Visual Coordinates (Presentation Layer)**
  - **Implementation**: Unity UI Toolkit Canvas (Size: `100,000px x 100,000px`).
  - **Center**: 시각적 캔버스의 중심인 `(50,000, 50,000)`이 논리적 `(0, 0)`에 대응됨.
  - **Conversion**: `WhiteboardFeature`가 `Render` 및 `Save` 시점에 오프셋(`50,000`)을 더하거나 빼서 변환.

### 3.4. ToolBox (도구함)

- **Class**: `ToolBoxFeature`
- **Key Features**: 유틸리티 도구 (텍스트 변환, 파일명 변경 등), 데이터 관리.

### 3.5. Companion (투명 펫 캐릭터)

- **Class**: `CompanionFeature`
- **Key Features**:
  - 투명 윈도우 오버레이, 동적 클릭 통과(Input Passthrough).
  - **인터랙션 모델**: Win32 API 폴링(`Update`) 기반의 하이브리드 입력 처리 (신뢰도 최우선).
  - **아바타 시스템**: `Root Motion` 제어, `Random Idle Loop`, 에디터 태그 스캐너 지원.
  - 독립 프로세스 실행 (`-mode companion`).

## 4. 프로세스 아키텍처 (Process Architecture)

**KarmoToys**는 단일 모니터 멀티 윈도우 한계 극복 위해 **멀티 프로세스 모델** 사용.

- **Main Process**: 기본 플래너 앱. (`AppMode.Main`, Mutex: `Global\KarmoLab_Main`)
- **Companion Process**: 투명 캐릭터 앱. (`AppMode.Companion`, Mutex: `Global\KarmoLab_Companion`)
- **AppLauncher / CompanionService**: 프로세스 관리 및 중복 실행 방지를 전담하는 독립 서비스 레이어.
- 두 프로세스는 완전히 독립적이며 OS 레벨에서 윈도우 스타일(투명/불투명) 다르게 가져감.

## 5. 폴더 구조 (Directory Structure)

```text
Assets/KarmoToys/
├── Main/           # 엔트리 포인트 및 핵심 서비스 (AppLauncher, CompanionService)
├── Core/           # 핵심 인터페이스 (IFeature, FeatureBase)
├── Common/         # 공통 데이터 모델 및 설정 (Define.cs, AppMode Enum)
└── Features/       # 기능별 모듈
    ├── Planner/
    └── .../
## 6. UI 표준 및 디자인 가이드 (UI Standards)

**KarmoToys**는 시각적 일관성과 유지보수성을 위해 전역 스타일 가이드를 준수함.

- **Theme Tokens**: 모든 색상과 수치는 `ThemeTokens.uss`의 변수를 통해 제어함.
- **Icon Button Standard (`.btn-icon-item`)**:
  - 아이콘 기반 버튼은 `MainStyle.uss`에 정의된 이 클래스를 공통 사용함.
  - 투명 배경을 기본으로 하며, 호버 시 `rgba(255, 255, 255, 0.12)` (다크) 또는 `rgba(0, 0, 0, 0.08)` (라이트) 배경 피드백을 제공함.
- **Overlay System**: `edit-overlay` 및 `edit-dialog` 클래스를 사용하여 일관된 팝업/확인창 UI를 제공함.
