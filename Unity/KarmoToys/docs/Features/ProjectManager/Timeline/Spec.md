# Timeline Spec (기능 명세)

Summary: 시간 축을 기반으로 ProjectItem을 시각화하고 관리하는 타임라인(Gantt) 기능 명세.

## 1. 개요 (Overview)

- **목적**: 프로젝트 일정(Start/End)을 직관적으로 파악하고 조정함.
- **방식**: 가로형 Gantt Chart 스타일의 타임라인 뷰 제공.
- **데이터 전략**: `ProjectManager`의 데이터와 연동 (One Data Multi View).

## 2. 요구사항 (Requirements)

### 2.1. 데이터 (Data)

- **Time Data**: 각 아이템은 `StartDateTicks`와 `DueDate`를 가짐.
- **Sync**: 타임라인 조작 시 데이터는 즉시 저장되며, **5분 단위**로 자동 반올림(Snapping) 처리됨.
- **Sorting**: 사이드바 Drag & Drop을 통해 아이템 순서를 변경하고 저장함.

### 2.2. 뷰 (View)

- **Layout**: `Shared ScrollView` 구조를 사용하여 Sidebar와 Canvas의 수직 스크롤이 완벽하게 동기화됨.
- **Visuals**:
  - **Zebra Striping**: 행(Row)마다 교차 배경색을 적용하여 시인성 확보.
  - **Layering**: Canvas Item이 Sidebar를 가리지 않도록 계층 구조 및 `overflow: hidden` 처리.
- **Start Date**: 무한 스크롤(Infinite Scroll)을 지원하여 `_startDateBase`가 동적으로 변경됨.

### 2.3. 상호작용 (Interaction)

- **Manipulator**:
  - **Drag Move**: 막대 전체 이동 (5분 단위 스냅 + 실시간 시간 표시).
  - **Drag Resize**: 막대 양 끝 조정 (5분 단위 스냅 + 실시간 시간 표시).
- **Navigation**:
  - **Zoom**: `Ctrl + MouseWheel`로 타임라인 시간 축 확대/축소 (마우스 커서 위치 Pivot).
  - **Pan (Horizontal)**:
    - `Shift + MouseWheel`: 수평 스크롤(날짜 이동).
    - **Background Drag**: 빈 공간 드래그 시 날짜 이동.
  - **Scroll (Vertical)**: 마우스 휠로 리스트 상하 스크롤.

## 3. 기술적 이슈 해결 (Tech Notes)

- **UI Toolkit**: `z-index` 미지원으로 인해 UXML 계층 순서(Hierarchy)와 `Position: Absolute`를 조합하여 레이어링 해결.
- **Event Handling**: `Shift + Scroll` 시 ScrollView의 기본 동작을 막기 위해 Capture Phase(`TrickleDown`)에서 이벤트 인터셉트 처리.
