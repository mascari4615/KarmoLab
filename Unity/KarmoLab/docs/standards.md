# KarmoToys 개발 표준 및 아키텍처 (Standards & Architecture)

Summary: KarmoToys 프로젝트의 아키텍처 설계, 네이밍 컨벤션, UI 구조 및 폴더 체계를 정의하는 통합 기술 가이드라인.

## 1. 핵심 아키텍처 (Core Architecture)

### 1.1. Feature System

- 모든 기능 단위는 독립적인 `Feature` 컴포넌트로 구현함.
- **Interface**: `IFeature` 및 `FeatureBase`를 기반으로 하며, `Initialize`, `OnSelect`, `OnDeselect` 등의 생명주기를 가짐.

### 1.2. Main Entry Point

- **KarmoToysApp.cs**: 앱의 진입점이자 중앙 관리자임.
- **Auto-Discovery**: 실행 시 필요한 Feature 컴포넌트를 자동으로 탐색하거나 GameObject에 추가함.
- **Settings**: `KarmoToysSettings` (ScriptableObject)를 통해 전역 설정을 주입받음.

### 1.3. Multi-View & Data Pattern

- **One Data, Multi-View**: 단일 데이터 소스(DTO)를 공유하며, 여러 뷰(Table, Kanban, Whiteboard 등)가 각자의 방식으로 렌더링함.
- **Fail Fast**: UI 바인딩 시 Null Check를 최소화하고, 문제 발생 시 런타임에 즉시 발견되도록 설계함.

### 1.4. 프로세스 모델 (Process Architecture)

- **멀티 프로세스**: 메인 앱(`Main`)과 투명 캐릭터(`Companion`)를 별도 프로세스로 운영하여 단일 윈도우의 제약을 극복함.
- **Service Layer**: `AppLauncher` 및 `CompanionService`가 프로세스 실행 및 중복 방지(Mutex)를 전담함.

---

## 2. 네이밍 컨벤션 (Naming Convention)

### 2.1. 기본 원칙: "인간은 Pascal, 기계는 kebab"

- **사람이 읽는 요소**: 클래스, 메서드, 메뉴 경로, 폴더명은 `PascalCase` 사용함.
- **시스템 인식 요소**: 패키지 ID, 브랜치명, 내부 식별자는 `kebab-case` 또는 `소문자` 사용함.

### 2.2. 세부 규칙

- **Brand/Creator**: `KarmoDDrine`, `Mascari4615` 고정 명칭 사용함.
- **C# Code**:
  - Class/Method/Property: `PascalCase`
  - Private Fields: `_camelCase` (언더바 접두사)
  - Namespace: `KarmoLab.KarmoToys.[FeatureName]`
- **Unity Assets**: 기본적인 폴더 및 에셋은 `PascalCase` 사용함. 단, 설정 데이터(JSON 등)는 용도에 따라 `camelCase` 허용함.

---

## 3. UI 표준 및 계층 구조 (UI Standards & Structure)

### 3.1. Visual Tree Hierarchy (MainView)

```text
[MainView.uxml] (Root)
 ├── Container (.root-container)
 │    ├── Sidebar Navigation (.nav-sidebar)
 │    │    ├── TabDashboard / TabProject / TabSchedule ...
 │    │
 │    └── Content Area (.content-area)
 │         ├── Top Bar (.top-bar)
 │         ├── <Instance> DashboardView
 │         └── <Instance> ProjectManagerView
 │              └── ProjectContent (.tab-content)
 │                   ├── TableWrapper / KanbanWrapper / ...
 │                   └── <Instance> ModalView / ContextMenu
 └── ToastContainer
```

### 3.2. 스타일링 가이드 (Styling)

- **모듈형 USS**: 각 UXML은 전용 USS 파일을 직접 참조하여 결합도를 높임.
- **TSS 관리**: `MainTheme.tss`는 전역 토큰(`ThemeTokens.uss`) 및 공통 스타일만 포함함.
- **스마트 스코핑 (Smart Scoping)**: 템플릿 인스턴스화 시 발생하는 높이 단절을 방지하기 위해 특정 부모 ID 기반의 하이패스 계층 선택자를 사용함.

  ```css
  /* 예시: #ProjectContent 내부의 모든 템플릿 컨테이너 자동 확장 */
  #ProjectContent TemplateContainer, #ProjectContent TemplateContainer > * {
      flex-grow: 1; height: 100%;
  }
  ```

---

## 4. 폴더 및 모듈 구조 (Directory Structure)

### 4.1. 물리 폴더 구조

- **Assets/KarmoToys/**
  - `Main/`: 엔트리 포인트 및 핵심 서비스 레이어.
  - `Core/`: 핵심 인터페이스 및 추상 클래스.
  - `Common/`: 데이터 모델, Enum, 유틸리티.
  - `Features/`: 개별 피처(Feature) 폴더. 각 폴더는 해당 피처의 C#, UXML, USS를 캡슐화함.

### 4.2. 피처 내부 구조 (예: ProjectManager)

- **Table/**, **Kanban/**, **Whiteboard/** 등 서브 모듈이 각각의 Controller와 UI 파일을 가짐.
- **ProjectManagerFeature.cs**: 개별 모듈을 통합하고 뷰 전환 기능을 제공하는 오케스트레이터 역할을 수행함.

---

## 5. 지식 아카이브 (Knowledge Archive)

특정 기술적 이슈나 상세 구현 가이드가 필요할 때 참고하는 문서들임. 모든 문서는 `./archive/` 폴더에 위치함.

- **UI Toolkit**:
  - [높이 단절 해결 가이드 (Smart Scoping)](./archive/template-height-collapse-guide.md)
  - [Z-Order 및 모달 시스템 설계](./archive/modal-zorder-solution.md)
  - [Overlay 시스템 구성](./archive/unity-uitoolkit-overlay-guide.md)
  - [테마 시스템 가이드](./archive/unity-uitoolkit-theme-system.md)
  - [UXML 템플릿 시스템](./archive/unity-uitoolkit-template-system.md)
- **Feature Specific**:
  - [투명 윈도우 및 컴패니언 설계](./archive/tech-transparent-window.md)
  - [화이트보드 그리드 렌더링 (LOD)](./archive/whiteboard-grid-rendering.md)

---
**최종 업데이트**: 2026-01-24
**작성자**: Alisa (Doll Maid Secretary)
