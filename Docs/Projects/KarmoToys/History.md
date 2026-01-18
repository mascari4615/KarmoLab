# KarmoLab Project History

## 2026-01-18 (KST)

- **컴패니언 관리 체계 전면 개편 (Companion Management)**:
  - **진입점 중앙화**: `ToolBox`에 흩어져 있던 컴패니언 실행 로직을 `KarmoToysApp` 및 `CompanionService`로 중앙 집중화.
  - **자동 실행 (Auto-Launch)**: 메인 프로그램 실행 시 컴패니언 프로세스를 자동으로 함께 소환하여 편의성 증대.
  - **실시간 토글 UI**: 헤더 상단에 컴패니언 소환/해제 전용 버튼 버튼 추가 및 가로형 툴바(Horizontal Toolbar) 레이아웃 적용.

- **확장형 모드 시스템 도입 (Scalable AppMode)**:
  - **Enum 기반 모드 관리**: `bool` 기반의 체크 방식을 `AppMode` Enum(`Main`, `Companion`)으로 전환. 향후 위젯, 집중 모드 등 새로운 실행 모드 추가를 위한 기반 마련.
  - **모드별 독립 뮤텍스**: 실행 모드에 따라 `Global\KarmoLab_{Mode}` 형태의 독립적인 뮤텍스를 생성하여 프로세스 간 간섭 방지 및 단일 인스턴스 보호 강화.

- **서비스 지향 아키텍처 리팩토링 (Service-Oriented Refactor)**:
  - **플랫폼 로직 격리**: OS 레벨 API(Mutex, Process)가 포함된 지저분한 코드를 `AppLauncher`와 `CompanionService`라는 독립된 서비스 클래스로 분리.
  - **DX(Developer Experience) 개선**: 전처리 심볼(`#if`)로 인해 에디터에서 인텔리센스가 비활성화되던 문제를 '메서드 내부 분기' 방식으로 해결하여 100% 코드 완성 및 에러 체크 지원.
  - **코드 다이어트**: `KarmoToysApp.cs` 본체에서 시스템 의존성을 제거하고 핵심 앱 흐름에만 집중하도록 정제.

## 2026-01-15 (KST)

- **테마 시스템 고도화 (Theme System)**:
  - **Style Tokenization**: `ThemeTokens.uss` 파일을 신규 생성하여 색상 및 수치 변수를 중앙 관리. 테마 확장성 대폭 강화.
  - **Enum 기반 관리**: `Define.AppTheme` Enum을 도입하여 테마 관리의 타입 안정성 및 데이터 정합성 확보.
  - **리플렉션 기반 테마 전환**: `System.Reflection` 및 `Enum` API를 활용하여 새로운 테마 추가 시 코드 수정 없이 자동으로 인지하고 순환(Dark -> Light -> ...)하는 스마트 전환 시스템 구축.
  - **설정 보존**: 선택한 테마가 `KarmoToysData`에 저장되어 앱 재시작 시에도 유지되도록 구현.

- **UI 서비스 아키텍처 리팩토링**:
  - **Core 네임스페이스 통합**: `ToastService`와 `TooltipService`를 `KarmoToys.Core` 네임스페이스로 이동하여 핵심 서비스 레이어 정립.
  - **전역 툴팁 시스템**: UI Toolkit의 내장 `tooltip` 속성을 감지하여 별도의 설정 없이도 런타임 툴팁을 표시하는 범용 서비스 구축.

- **백업 시스템 대규모 개편 (Backup System v9)**
  - **지능형 백업 트리거 (Deep Modification Detection)**: 단순 개수 변화뿐만 아니라, `TimeBlock` 시간/제목, `TodoItem` 완료 여부/내용, `SecretNote` 상세 내용 변경까지 완벽 감지.
  - **누적 변경 감지 (Cumulative Tracking)**: 마지막 저장 시점이 아닌, **마지막 백업 파일**과 비교하여 변경 사항 누적 카운트. 임계치(Change Threshold) 도달 시 백업 수행.
  - **안전장치 (Fallback)**: 백업 파일 부재 시 즉시 초기 백업 생성. (InitBackup)
  - **구조 단순화 (Flat Structure)**: `Backups/{SaveId}/` 형태를 `Backups/` 단일 폴더로 통합.
  - **중복 방지**: MD5 해시 체크로 내용 동일 중복 백업 생성 원천 차단.

- **설정 탭 분리 (Preferences Refactor)**
  - **탭 분리**: 기존 `ToolBox`에 섞여 있던 앱 설정(테마, 백업 등)을 독립된 **Preferences(설정)** 탭으로 분리하여 UI 구조 개선.

## 2026-01-12 (KST) ~ 2026-01-13 (KST)

- **디버그 및 데이터 관리 (Debug & Data)**:
  - **Data Management UI**: [도구] 탭에 데이터 관련 유틸리티 섹션 추가.
  - **Open Save Folder**: `savedata.json` 저장 경로를 원클릭으로 탐색기에서 열람.
  - **Refresh Data**: 외부 수정된 데이터를 런타임에 즉시 재로드하여 반영 (Hot Reload).

- **개발 환경 최적화 (DX)**:
  - **VS Code Workspace**: 프로젝트 권장 확장 프로그램 목록(`.vscode/extensions.json`) 구성.

## 2026-01-09: Tools Integration & Refactoring

### 1. Refactoring

- **Controller Partitioning**: `PlannerController.cs` became too large, so it was split into `partial` classes.

### 2. Tools Integration

- **Objective**: Integrate legacy utilities (from `Assets/Scripts/Content`) directly into the Planner UI.
- **ITool Architecture**: Created `ITool` interface to standardize tool behaviors.
