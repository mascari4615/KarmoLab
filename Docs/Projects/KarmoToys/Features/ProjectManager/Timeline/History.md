# Timeline History (피처 히스토리)

Summary: Timeline 기능의 변경 이력 및 주요 의사결정 기록.

## 2026-01-20

- **Initial Setup**: 피처 문서 구조 생성 (Spec, History, Todo).
- **Decision**: 초기 버전은 **Gantt Chart** 형태로 구현하며, 추후 Calendar 뷰 통합을 고려함.
- **Feature Polish**:
  - [Refactor] Shared ScrollView로 Sidebar/Canvas 수직 스크롤 완벽 동기화.
  - [Visual] Zebra Striping (홀짝 배경색) 적용.
  - [Visual] `TimelineStyle.uss`에서 미지원 `z-index` 제거 및 Layering 구조 개선.
  - [Interaction] Sidebar Drag & Drop으로 Task 순서 변경 구현.
  - [Interaction] 블록 이동/리사이즈 시 5분 단위 스냅 및 실시간 시간 피드백 표시.
  - [Interaction] Ctrl + Mouse Wheel로 타임라인 수평 확대/축소 (Zoom) 구현.
  - [Interaction] Zoom Pivot 개선 (마우스 커서 위치 기준으로 확대/축소).
  - [Interaction] Shift + Scroll로 수평 패닝(날짜 이동) 구현.
  - [Interaction] 빈 공간 드래그 패닝 개선 (Item 제외 모든 영역 클릭 시 이동).
