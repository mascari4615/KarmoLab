# Planner Module Documentation

## 1. 개요 (Overview)
**Planner**는 사용자의 일정 관리, 퀘스트(할 일) 추적, 그리고 동기 부여를 위한 대시보드 시스템입니다. 게임 UI와 유사한 경험을 제공하며, 생산성을 높이기 위한 전략적 도구로 설계되었습니다.

---

## 2. 아키텍처 (Architecture)
이 모듈은 데이터와 로직, UI가 명확히 분리된 구조를 따릅니다.

### 2.1. 데이터 모델 (Model)
- **파일**: `PlannerModel.cs`
- **역할**: 순수 C# 클래스로 데이터 구조를 정의합니다.
- **주요 클래스**:
  - `PlannerData`: 전체 데이터를 포함하는 루트 클래스.
  - `TimeBlock`: 일정(시간표)의 개별 블록 데이터 (제목, 시간, 색상, 태그 등).
  - `TimeContext`: 주간 루틴 전략(시간표)을 관리하는 컨텍스트.
  - **개인정보 보호**: 사용자 이름, 목표 등은 하드코딩하지 않고 데이터 필드(`PersonalQuestTitle` 등)로 관리합니다.

### 2.2. 뷰 (View)
- **파일**: `PlannerView.uxml`, `PlannerStyle.uss`
- **기술**: Unity UI Toolkit
- **특징**:
  - `UXML`: 계층 구조 및 레이아웃 정의 (Dashboard, Tasks, Schedule, SecretView 등 탭 구성).
  - `USS`: 스타일링 정의 (Tailwind CSS와 유사한 유틸리티 클래스 네이밍 사용).
  - **Tagging UI**: 태그 입력 시 칩(Chip) 형태로 시각화.

### 2.3. 컨트롤러 (Controller) - Partial Class
비대한 `PlannerController` 클래스를 관리하기 쉽게 기능별로 분할하였습니다.

- **`PlannerController.cs` (Main)**
  - 초기화(`Initialize`), `OnEnable`/`OnDisable` 생명주기 관리.
  - UI 요소 바인딩 및 탭 전환 로직.
  
- **`PlannerController.IO.cs`**
  - `PlannerData`의 JSON 직렬화/역직렬화.
  - 로컬 파일 시스템(`Application.persistentDataPath`) 저장 및 로드.

- **`PlannerController.Dashboard.cs`**
  - 대시보드 데이터 갱신 (D-Day, 진행률, 통계).
  - 퀘스트 보드(Tasks) 리스트 렌더링.

- **`PlannerController.Schedule.cs`**
  - 주간 시간표 렌더링.
  - 시간 블록 생성 및 드래그 앤 드롭(DnD) 로직.
  - 스냅(Snap) 기능: 5분 단위(설정 가능)로 시간 블록 자석 효과.

- **`PlannerController.Dialogs.cs`**
  - 팝업 및 다이얼로그 관리 (상세 보기, 수정, 삭제).
  - **Tag System**: 태그 추가/삭제 로직 및 동적 UI 생성.
  - 색상 선택기(Color Picker) 로직.

---

## 3. 주요 기능 (Features)

### 3.1. 대시보드 (Dashboard)
- **Status HUD**: D-Day, 프로젝트 목표, 개인/팀 스탯을 한눈에 확인.
- **Moto**: 랜덤하거나 지정된 NPC 멘토의 조언 출력.

### 3.2. 퀘스트 보드 (Quest Board)
- 3가지 카테고리(Main, Skill, Side)로 할 일을 분류.
- 체크박스 기반의 할 일 완료 처리 및 진행 상황 시각화.

### 3.3. 전략 시간표 (Strategic Schedule)
- **Time Boxing**: 하루를 시간 단위 블록으로 시각화.
- **Drag & Drop**: 마우스로 시간을 드래그하여 직관적으로 블록 생성.
- **Snapping**: 블록 생성 시 5분 단위로 깔끔하게 정렬.

### 3.4. 비밀 노트 (Secret Note)
- 회고 및 트러블슈팅 로그 기록.
- "무엇을 얻을 것인가?"라는 질문을 통해 학습 내용 정리.

---

## 4. 개발 히스토리 & 디자인 결정

### 4.1. 리팩토링 (Refactoring)
- 초기 단일 파일(`PlannerController.cs`)이 비대해짐에 따라 **Partial Class**로 분리.
- 유지보수성과 가독성을 대폭 향상시킴.

### 4.2. UI/UX 개선
- **태그 시스템**: 텍스트 나열 방식에서 유튜브 스타일의 **태그 칩(Tag Chip)** UI로 변경하여 시인성 개선.
- **개인정보 보호**: 코드 내 하드코딩된 텍스트(예: "마녀! 귀찮아~")를 제거하고 데이터 바인딩 방식으로 변경하여 퍼블릭 리포지토리 안전성 확보.

### 4.3. 문서화
- 코파일럿 지침(`copilot-instructions.md`)에 Unity 프로젝트 규칙(UI Toolkit 사용, Partial Class 권장 등) 추가.
- 모든 UI 텍스트의 데이터 화.

# Planner Development Log

## 2026-01-09: Tools Integration & Refactoring

### 1. Refactoring
- **Controller Partitioning**: `PlannerController.cs` became too large, so it was split into `partial` classes:
  - `PlannerController.cs`: Main initialization and Tab logic.
  - `PlannerController.Dashboard.cs`: Dashboard specific logic.
  - `PlannerController.Schedule.cs`: Schedule/Week view logic.
  - `PlannerController.Tools.cs`: New Tools tab logic.

### 2. Tools Integration
- **Objective**: Integrate legacy utilities (from `Assets/Scripts/Content`) directly into the Planner UI.
- **ITool Architecture**:
  - Created `ITool` interface to standardize tool behaviors.
  - Tools:
    - **TextFormatter**: KakaoTalk bullet point style formatter.
    - **FileNameManager**: Rename screenshot files sequentially.
    - **YoutubeTool**: Fetch playlist video counts (using Youtube Data API).
- **UI Changes**:
  - Added "Tools" (도구함) Tab to `PlannerView.uxml`.
  - Merged tool interaction UI (Input/Output/Actions) into the main window.
  - Updated `PlannerStyle.uss` to support tool-specific styling.

---