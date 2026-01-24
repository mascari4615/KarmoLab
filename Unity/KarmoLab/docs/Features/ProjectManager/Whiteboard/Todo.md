# Whiteboard Todo (작업 목록)

Summary: Whiteboard 기능 개선 태스크 리스트.

## 🔥 Bug Fix (SubTab 전환 후 미표시 문제)

- [x] **1. SpawnNodeVisual 버그 수정**: 노드 생성 후 Bind 없이 버려지는 문제. data 파라미터 활용하여 올바르게 생성/Bind/위치 설정.
- [x] **2. CreateNode 중복 ID 문제**: 데이터 저장용과 시각화용 노드 ID 불일치. 저장된 데이터 객체를 그대로 SpawnNodeVisual에 전달.
- [x] **3. 데이터 모델 통일**: WhiteboardNodeData 대신 ProjectItemData.Position 사용으로 통합.
- [x] **4. Refresh() 구현**: 뷰 전환 시 데이터 기반 노드 재렌더링.
- [x] **5. 노드 위치 설정**: SpawnNodeVisual에서 style.left/top을 데이터 기반으로 설정.

## Backlog / Polish

- [ ] **Delete Button**: 선택된 노드 삭제 (UI 버튼 or Del키).
- [ ] **Creation UX**: 사이드바에서 드래그하여 생성하기 등 다양한 방식.
- [ ] **Art**: 포스트잇 느낌의 비주얼 개선 및 사운드 효과.
- [ ] **Data Sync**: ProjectManager의 Task 데이터를 화이트보드 상의 노드로 불러오기 (양방향 동기화).
