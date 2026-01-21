# Whiteboard Spec (기능 명세)

Summary: 무한 캔버스 상에서 노드(카드)를 자유롭게 배치하고 연결하는 화이트보드 기능 명세.

## 1. 개요 (Overview)

- **목적**: 브레인스토밍, 아이디어 정리, 자유로운 메모 작성을 위한 공간 제공.
- **특징**: 무한 캔버스, 자유로운 줌/팬, 물리적 느낌의 조작감.

## 2. 주요 기능 (Core Features)

### 2.1. 캔버스 (Infinite Canvas)

- **Infinite Scroll**: `WhiteboardView`는 `100000px` 가상의 크기를 가지며, `WhiteboardContainer` 내에서 `transform`을 통해 표시.
- **Manipulator**: `PanZoomManipulator` (Pointer/Wheel Event 기반) 제공.
  - **Zoom**: 마우스 휠 (Scale 조절).
  - **Pan**: 마우스 가운데 버튼 또는 Alt+드래그 (Position 조절).
- **Dynamic Grid**: 줌 레벨에 따라 간격이 조정되는(LOD) 점/선 그리드 렌더링 (`GridBackground`).
  - `Paint2D` API 사용으로 성능 최적화.

### 2.2. 노드 (Nodes)

- **Structure**: Title(제목)과 Content(내용)를 가진 카드 형태 VisualElement.
- **Creation**: 배경 우클릭으로 생성 (Context Menu).
- **Interaction**:
  - **Drag**: `NodeDragManipulator`를 통해 줌 레벨 역보정(Canvas Scale Inverse)하여 1:1 마우스 추적.
  - **Snap**: 이동 시 `25px` 단위 그리드 스냅.
  - **Edit**: 제목/내용 더블 클릭 시 `TextField`로 전환되어 수정 가능 (Double Click Threshold 적용).

### 2.3. 데이터 (Data)

- **Persistence**: `KarmoToysData` 내 `WhiteboardNodes` 리스트에 저장.
- **Properties**: `Id`, `Title`, `Content`, `X`, `Y`, `Width`, `Height`, `Color`.

## 3. 백로그 & 개선 예정 (Backlog)

- [ ] 노드 삭제 기능.
- [ ] 노드 색상 변경.
- [ ] 노드 간 연결선(Connection/Edge).
- [ ] ProjectManager 데이터와의 연동 (Task를 노드로 변환).
