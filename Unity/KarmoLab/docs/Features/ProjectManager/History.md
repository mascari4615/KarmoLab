# Features/ProjectManager History

Summary: ProjectManager 피처의 개발 및 변경 이력.

## 2026-01-24 (KST)

- **UI 모듈화 및 자산 분리 (UI Modularization)**:
  - **ProjectManager 분할**: Table/Kanban/Timeline/Whiteboard 뷰를 `TableWrapper` 등의 컨테이너로 격리하고 UXML 템플릿화.
  - **Modal/Context 분리**: `Modal` 및 `ContextMenu` UI를 독립적인 UXML/USS 파일로 분리하고 로직을 정적 프로퍼티로 개방.
  - **경로 오류 수정**: UXML 로드 시 발생하던 `Asset Name Empty` 에러 해결을 위해 절대 경로(`project://`)를 상대 경로로 전환.
- **Fix**: `TemplateContainer`에 의한 높이 단절(Height Collapse) 문제 해결
  - `.stretch-container` 및 스마트 스코핑 패턴 적용으로 Whiteboard 렌더링 정상화.
- **Refinement**: 스타일 관리 정책 변경 (Local UXML Style)
  - `MainTheme.tss` 중앙 관리 대신 각 UXML이 쌍이 되는 USS를 직접 소유하게 하여 경로 관리 편의성 및 모듈성 강화.
- **Whiteboard Interaction Repair**:
  - **드래그 정상화**: `NodeDragManipulator` 수리 및 UI 좌표-데이터 동기화 로직 보강.
  - **편집 안정화**: `AttachToPanelEvent`와 결정론적 프레임 시퀀싱 도입으로 더블클릭 텍스트 편집 결함 해결.
  - **클린 캔버스**: 이벤트를 차단하던 테스트 엘리먼트 제거 및 `Canvas` 상호작용성 복구.마크다운 문서엔 음슴체를 쓰겠음.

- **아키텍처 개선 (Architecture Refinement)**:
  - **Hybrid Singleton 패턴**: `ProjectManagerFeature.Instance`를 유지하되, 하위 뷰들은 독립적인 컴포넌트로 관리하는 실용적 구조 적용.
  - **Fast Fail 정책**: UI 요소에 대한 불필요한 Null 체크를 제거하여 문제 발생 시 즉각 버그가 드러나도록(Fail Fast) 개선.
