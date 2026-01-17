# KarmoToys Architecture

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

### 3.3. QuestBoard (퀘스트 보드)
- **Class**: `QuestBoardFeature`
- **Key Features**: 할 일(ToDo) 관리 (Main, Skill, Side Quest).

### 3.4. Note (비밀 노트)
- **Class**: `NoteFeature`
- **Key Features**: 문제 해결 로그 및 TIL 기록.

### 3.5. ToolBox (도구함)
- **Class**: `ToolBoxFeature`
- **Key Features**: 유틸리티 도구 (텍스트 변환, 파일명 변경 등), 데이터 관리.

### 3.6. Companion (투명 펫 캐릭터)
- **Class**: `CompanionFeature`
- **Key Features**:
  - 투명 윈도우 오버레이, 동적 클릭 통과(Input Passthrough).
  - **인터랙션 모델**: Win32 API 폴링(`Update`) 기반의 하이브리드 입력 처리 (신뢰도 최우선).
  - **아바타 시스템**: `Root Motion` 제어, `Random Idle Loop`, 에디터 태그 스캐너 지원.
  - 독립 프로세스 실행 (`-mode companion`).

## 4. 프로세스 아키텍처 (Process Architecture)
**KarmoToys**는 단일 모니터 멀티 윈도우 한계 극복 위해 **멀티 프로세스 모델** 사용.
- **Main Process**: 기본 플래너 앱. (`Mutex: Global\KarmoLab_Main`)
- **Companion Process**: 투명 캐릭터 앱. (`Mutex: Global\KarmoLab_Companion`)
- 두 프로세스는 완전히 독립적이며 OS 레벨에서 윈도우 스타일(투명/불투명) 다르게 가져감.

## 5. 폴더 구조 (Directory Structure)
```
Assets/KarmoToys/
├── Main/           # 엔트리 포인트 (KarmoToysApp)
├── Core/           # 핵심 인터페이스 (IFeature, FeatureBase)
├── Common/         # 공통 데이터 모델 및 설정 (Data/, KarmoToysSettings.cs)
└── Features/       # 기능별 모듈
    ├── Planner/
    └── .../
```
