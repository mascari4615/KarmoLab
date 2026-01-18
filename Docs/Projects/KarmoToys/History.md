# KarmoLab Project History

## 2026-01-18 (KST) - Part 3

- **설정(Preferences) UI 고도화 및 데이터 관리 강화**:
  - **UI 스타일 최적화**: 인라인 스타일을 `PreferencesStyle.uss` 클래스 기반 스타일로 완전히 이관하여 런타임 안정성 및 유지보수성 확보.
  - **백업 관리 강화**: 각 백업 항목에 개별 삭제(🗑️) 버튼을 추가하고, 실수 방지를 위한 **확인 팝업 오버레이** 시스템 구축.
  - **레이아웃 개선**: 비교 결과(Diff Result) 영역을 리스트 상단으로 이동하여 백업 선택 시 즉각적인 시각 피드백 제공.
  - **리스트 가시성**: 백업 아이템에 배경색 및 호버 효과를 적용하여 스크롤 뷰와의 시각적 구분 명확화.

- **아이콘 버튼 전역 표준화 (Icon Button Standardization)**:
  - **공통 스타일 정의**: `MainStyle.uss`에 `.btn-icon-item` 클래스를 정의하여 프로젝트 전역 표준 아이콘 버튼 스타일 수립.
  - **일관된 피드백 적용**: 메인 헤더(컴패니언, 테마 토글) 및 피처 내 아이콘 버튼들에 동일한 호버 피드백 및 트랜지션 적용.
  - **UX 최적화**: 마우스 아웃 시 색상이 어색하게 어두워지는 현상을 방지하기 위해 기본 밝기를 상향하고 배경 위주의 피드백으로 정교화.

- **백업 감지 로직 정교화 (DataService Update)**:
  - **ProjectItems 감지**: `ProjectItemData`의 상태, 제목, 내용 변화를 감지하여 백업 트리거 조건에 포함.

## 2026-01-18 (KST) - Part 2

- **전역 명시적 타입 리팩토링 (Global Explicit Type Refactoring)**:
  - **`var` 제거**: `Assets/KarmoToys` 내의 모든 C# 파일에서 `var` 키워드를 제거하고 명시적 타입 선언으로 교체. 코드의 의도를 명확히 하고 IntelliSense 가독성 향상.
  - **데이터 모델 정합성 확보**: 리팩토링 과정에서 발견된 `KarmoToysData.cs` 내의 `PlannerData` 중복 정의를 제거하고 `ScheduleData`로 단일화.
  - **네임스페이스 충돌 해결**: `TodoItem`, `TimeBlock` 등 여러 곳에 정의된 타입들에 대해 Fully Qualified Name(완전한 타입 이름)을 사용하여 컴파일 모호성 제거.

- **PlannerFeature 복구 및 코드 정규화 (PlannerFeature Recovery)**:
  - **소실 코드 복구**: 파일 손상으로 유실되었던 `PlannerFeature.Schedule.cs`의 핵심 로직(블록 드래그, 리사이징, 렌더링 시스템)을 Git 복구 및 재구성을 통해 완전 정상화.
  - **빌드 오류 완전 해소**: 리팩토링 후 발생한 모든 컴파일 에러(CS0103, CS0104, CS0029 등)를 해결하여 `Assembly-CSharp.csproj` 빌드 성공(Error 0) 달성.

## 2026-01-18 (KST)

- **인코딩 표준화 및 복구 (Encoding Standardization & Recovery)**:
  - **문자열 복구**: AI 수정 과정에서 깨진 `CompanionFeature.cs`의 설정 아이콘(`⚙️`) 및 기타 유니코드 문자열 복구.
  - **인코딩 가이드 수립**: `Encoding_Policy.md`를 작성하여 모든 프로젝트 파일의 인코딩을 **UTF-8 with BOM**으로 고수하도록 규정.
  - **원인 분석**: AI 도구의 기본 인코딩(UTF-8)과 윈도우 환경(UTF-8 BOM) 간의 불일치 문제를 파악하고 방지 대책 마련.

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
