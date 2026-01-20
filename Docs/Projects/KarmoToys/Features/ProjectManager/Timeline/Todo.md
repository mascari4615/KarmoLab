# Timeline Todo (작업 목록)

Summary: Timeline 기능 구현을 위한 태스크 리스트.

## Phase 1: 기본 구조 (Skeleton)

- [x] **Feature Init**: `TimelineFeature` 클래스 및 기본 폴더 구조 생성.
- [x] **Data Model**: `ProjectItemData`에 시간 관련 필드(`StartDate`, `EndDate`) 추가 확인.
- [x] **View Skeleton**: `TimelineView.uxml`, `TimelineStyle.uss` 생성.

## Phase 2: 렌더링 (Rendering)

- [x] **Time Axis**: 상단 날짜 헤더 렌더링 로직 구현.
- [x] **Grid Lines**: 날짜 구분에 따른 세로 격자선 그리기.
- [x] **Item Rendering**: 데이터 기반 타임라인 막대(Bar) 생성 및 배치.

## Phase 3: 상호작용 (Interaction)

- [x] **Scroll/Zoom**: 가로 스크롤 및 줌 기능.
- [x] **Drag Move**: 일정 이동 구현.
- [x] **Drag Resize**: 일정 길이 조정 구현.

## Phase 4: 연동 및 폴리싱 (Sync & Polish)

- [x] **Data Sync**: 변경 사항 `KarmoToysData` 저장 연동.
- [x] **UI Polish**: 스타일 다듬기, 애니메이션. (Zebra Striping, Layout Fixes)
