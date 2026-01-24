# Features/ProjectManager History

Summary: ProjectManager 피처의 개발 및 변경 이력.

## 2026-01-24 (KST)

- **UI 모듈화 및 자산 분리 (UI Modularization)**:
  - **ProjectManager 분할**: Table/Kanban/Timeline/Whiteboard 뷰를 `TableWrapper` 등의 컨테이너로 격리하고 UXML 템플릿화.
  - **Modal/Context 분리**: `Modal` 및 `ContextMenu` UI를 독립적인 UXML/USS 파일로 분리하고 로직을 정적 프로퍼티로 개방.
  - **경로 오류 수정**: UXML 로드 시 발생하던 `Asset Name Empty` 에러 해결을 위해 절대 경로(`project://`)를 상대 경로로 전환.

- **아키텍처 개선 (Architecture Refinement)**:
  - **Hybrid Singleton 패턴**: `ProjectManagerFeature.Instance`를 유지하되, 하위 뷰들은 독립적인 컴포넌트로 관리하는 실용적 구조 적용.
  - **Fast Fail 정책**: UI 요소에 대한 불필요한 Null 체크를 제거하여 문제 발생 시 즉각 버그가 드러나도록(Fail Fast) 개선.
