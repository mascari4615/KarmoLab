# Kanban Spec (기능 명세)

Summary: 프로젝트 아이템을 상태(Status)별로 시각화하고 관리하는 칸반 보드.

## 1. 개요 (Overview)

- **목적**: 업무의 진행 상태(To Do, In Progress, Done 등)를 한눈에 파악하고 흐름을 관리.
- **방식**: 컬럼(Column) 기반의 카드 이동 인터페이스.

## 2. 주요 기능 (Core Features)

### 2.1. 컬럼 (Columns)

- **Status Mapping**: 각 컬럼은 특정 `Status` 값(Pending, Active, Complete)에 대응.
- **Item Count**: 상단 헤더에 해당 상태의 아이템 개수 표시.
- **Quick Add**: 컬럼 하단 버튼으로 해당 상태의 새 아이템 즉시 생성.

### 2.2. 카드 (Cards)

- **Visual**: 아이템의 제목, 우선순위(Priority), 담당자 등을 요약 표시.
- **Drag & Drop**:
  - 컬럼 간 이동을 통해 상태(`Status`) 변경.
  - 컬럼 내 순서 변경 (Priority 조정).
  - 드래그 시 고스트(Ghost) 이미지를 통해 이동 위치 미리보기.

## 3. 데이터 연동 (Data Integration)

- **ProjectManagerData**: `ProjectManager` 기능의 통합 데이터를 공유 (One Data Multi View).
- **Auto Save**: 이동 즉시 데이터 반영 및 저장.

## 4. 백로그 (Backlog)

- [ ] Swimlane (가로 구분) 지원.
- [ ] WIP (Work In Progress) Limit 설정.
