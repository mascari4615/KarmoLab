# KarmoLab Project History

## 2026-01-09: Tools Integration & Refactoring

### 1. Refactoring
- **Controller Partitioning**: `PlannerController.cs` became too large, so it was split into `partial` classes:
  - `PlannerController.cs`: Main initialization and Tab logic.
  - `PlannerController.Dashboard.cs`: Dashboard specific logic.
  - `PlannerController.Schedule.cs`: Schedule/Week view logic.
  - `PlannerController.Tools.cs`: New Tools tab logic.

### 2. Tools Integration
- **Objective**: Integrate legacy utilities (from `Assets/Scripts/Content`) directly into the Planner UI.
- **ITool Architecture**:
  - Created `ITool` interface to standardize tool behaviors.
  - Tools:
    - **TextFormatter**: KakaoTalk bullet point style formatter.
    - **FileNameManager**: Rename screenshot files sequentially.
    - **YoutubeTool**: Fetch playlist video counts (using Youtube Data API).
- **UI Changes**:
  - Added "Tools" (도구함) Tab to `PlannerView.uxml`.
  - Merged tool interaction UI (Input/Output/Actions) into the main window.
  - Updated `PlannerStyle.uss` to support tool-specific styling.

## 2026-01-12 (KST)

- **Planner UI 개선**:
    - **스케줄 블록 고도화**: 높이에 따른 동적 레이아웃(Row/Column) 적용으로 작은 블록의 시인성 대폭 개선.
    - **UX 강화**: 커스텀 툴팁 도입으로 정보 확인 용이성 확보, 리사이즈/이동 영역 분리(좌/우 50%).
    - **안정성**: 우클릭 컨텍스트 메뉴 이벤트 핸들링 수정 (`PointerDownEvent`).

- **일정 관리 기능 확장**:
    - **휴지통(Trash) 시스템**: 실수 방지를 위한 Soft Delete 방식 도입. 24시간 후 자동 영구 삭제.
    - **UI 추가**: 상단 헤더의 휴지통 아이콘을 통해 삭제된 항목 조회, 복구(Restore), 영구 삭제(Legacy Delete) 가능.

## 2026-01-13 (KST)

- **반복 일정 시스템 (Recurring Events)**:
    - **데이터 모델**: `RecurrenceRule`, `RecurrenceEnd`, `ExceptionDates` 도입 및 데이터 처리 로직 구현.
    - **스마트 편집**: 반복 일정 수정/삭제 시 '이 일정만(This Event)'과 '이후 모든 일정(All Future)' 분기 처리.
    - **버그 수정**: 반복 규칙이 'None'일 때 블록이 사라지는 현상 해결.

- **드래그 앤 드롭 고도화 & 리사이즈**:
    - **조작감 개선**: 드래그 시작 시 블록이 마우스로 점프하는 현상 수정 (Offset 유지).
    - **반복 일정 지원**: 반복 일정도 드래그/리사이즈 가능하도록 업데이트, 종료 시 수정 범위 선택 팝업 연결.
    - **로직 최적화**: 제자리 이동, 크기 미변경 등 무의미한 조작 시 팝업/저장 수행하지 않음 (No-Op Check).

- **UX/안정성**:
    - **취소 로직 강화**: 리사이즈/드래그 도중 취소(Cancel) 버튼 클릭 시 UI 상태 원상복구.
    - **전체 수정 경험**: '이후 모든 일정' 선택 시 기존 시리즈 종료 + 새 시리즈 시작 로직 정립.

- **디버그 및 데이터 관리 (Debug & Data)**:
    - **Data Management UI**: [도구] 탭에 데이터 관련 유틸리티 섹션 추가.
    - **Open Save Folder**: `savedata.json` 저장 경로를 원클릭으로 탐색기에서 열람.
    - **Refresh Data**: 외부 수정된 데이터를 런타임에 즉시 재로드하여 반영 (Hot Reload).

- **개발 환경 최적화 (DX)**:
    - **VS Code Workspace**: 프로젝트 권장 확장 프로그램 목록(`.vscode/extensions.json`) 구성.

- **KarmoTools**:
    - **Build Helper**: Unity 에디터 전용 빌드 및 배포 도구 (`Assets/KarmoTools/Editor`).
    - **Smart Build**: `Prefix_Time_Memo` 자동 네이밍 및 경로 관리.
    - **Patch Mode**: 빌드 후 Live 경로로 즉시 덮어쓰기 기능 지원.
    - **Auto Cleanup**: 빌드 시 `DoNotShip` 등 불필요한 디버그 폴더 자동 삭제 옵션.

- **빌드 및 환경 안정화**:
    - **컴파일/인텔리센스 복구**: `Assembly-CSharp.csproj`의 잘못된 Analyzer 참조 제거로 `CS0006` 및 인텔리센스 먹통 현상 해결.
    - **Linq 누락 수정**: `BuildToolWindow.cs`에 `using System.Linq` 추가로 `CS1061` 해결.

- **반복 일정 고도화 (Weekly)**:
    - **요일 선택 기능**: '매주' 반복 시 특정 요일(월, 수, 금 등)만 선택하여 반복할 수 있도록 UI/로직 확장.
    - **통합된 반복 옵션**:
        - **Daily 삭제**: '매주(Weekly)'에서 7일 모두 선택하는 것으로 대체하여 로직 일원화.
        - **Monthly (매월)**: 특정 일(Day)을 지정하여 매월 반복 (예: 매월 25일).
        - **Yearly (매년)**: 특정 날짜(Date)를 지정하여 매년 반복 (예: 12월 25일).
    - **반복 삭제 고도화**: 반복 일정 삭제 시 '이번 건만(This Instance)'과 '향후 모든 일정(All Future)'을 선택하는 팝업 제공.
        - '향후 모든 일정' 선택 시 마감일(`RecurrenceEnd`)을 설정하여 기록 보존.
    - **반복 기간 표시**: 반복 시작일(From)과 종료일(Until)을 UI에 표시.
        - 시작일과 종료일을 직접 수정하여 일정의 전체 기간을 조정 가능.
    - **UI 개선**: 반복 설정 UI를 'Repeat Event' 토글로 제어하도록 변경하여 복잡도 감소.
        - 반복이 아닐 경우 불필요한 기간/옵션 필드 숨김.
        - 기간 설정 필드(From/Until)의 레이아웃을 개선하여 가시성 확보.
    - **데이터 무결성 강화**:
        - **입력 유효성 검사**: 시작일/종료일 오류 시 "어불성설이다냥!" 토스트 팝업으로 사용자에게 경고 및 저장 차단.
        - **자동 날짜 보정**: 날짜 보정 시 토스트 팝업으로 변경 사실 알림.
    - **토스트 알림 시스템**: 시스템 전반에서 사용 가능한 모듈형 토스트 알림 구현 (`PlannerController.Toast.cs`).
    - **스마트 편집**: 기존 일정을 수정할 때도 저장된 요일 정보를 불러와 유지하도록 개선.

## 2026-01-14 (KST)

- **코드 품질 및 시스템 안정화**:
    - **토스트 시스템 개선**:
        - **UI 스케줄러 도입**: `StartCoroutine` 대신 `UI Toolkit Scheduler`를 사용하여 Play Mode뿐 아니라 Edit Mode에서도 토스트 알림이 정상 작동하도록 수정.
        - **렌더링 순서 수정**: 토스트 컨테이너를 UXML 최하단으로 이동하여 모든 UI 위에 표시되도록(Z-Index 확보) 개선.
    - **개발 환경 최적화**:
        - **불필요한 코드 정리**: 미사용 필드 및 레거시 메서드(`AnimateToast` 등) 제거로 코드 베이스 경량화.
        - **생명주기 단순화**: `[ExecuteAlways]` 제거 및 `Start` 기반의 단일 초기화 흐름으로 로직 간소화. 불필요한 이벤트 재구독 패턴 제거.
    - **사용자 경험(UX)**:
        - **환영 인사**: 앱 실행 시 "집사님 환영한다냥!" 토스트 알림 추가.

- **KarmoToys 아키텍처 리팩토링 (Refactoring)**:
    - **Namespace & Branding**: `KarmoLab` -> `KarmoToys`로 네임스페이스 및 아키텍처 전면 개편.
    - **Feature System**: `IFeature` / `FeatureBase` 도입, `Module/Planner`를 `Features/Planner` 등으로 모듈화.
    - **Runtime Initialization**:
        - `KarmoToysApp.EnsureFeatures()`: 실행 시 누락된 기능 컴포넌트 자동 추가 (No Boilerplate).
        - **Fail Fast**: UI Null Check를 제거하여 바인딩 오류를 조기 발견 및 수정.
    - **Settings**: 하드코딩된 설정값을 `KarmoToysSettings` (ScriptableObject)로 분리.
    - **Planner Fixes**:
        - **UI Position**: `DetailPopup` 수정 (시간축 기반 높이, 요일 기반 좌우 위치).
        - **Recurrence Logic**: '매주' 반복 시 선택된 요일들이 정상적으로 저장되도록 파싱 로직 수정 (`Weekly;Mon,Fri`).
        - **Data Integrity**: 수정 모달(`OnSaveEdit`)에서 모든 필드(설명, 태그 등)가 정상 저장되도록 수정.

- **코드 정리 및 프로젝트 구조 통합**:
    - **레거시 코드 제거**:
        - `Assets/Module/Planner/PlannerController*.cs` (7개 파일) 삭제 - 구버전 컨트롤러 완전 폐기.
        - 불필요한 주석 제거: `PlannerFeature.Schedule.cs`, `PlannerFeature.Dialogs.cs`에서 개발 과정 중 남겨진 주석(`// A. Normal`, `// --- Helpers ---` 등) 정리.
        - Debug 로그 제거: `ShowDetailPopup`, `ShowEditDialog`, `OnSaveEdit`의 디버깅 출력 삭제.
    - **프로젝트 구조 통합**:
        - **`Assets/Module` → `KarmoToys` 이동**:
            - UI Assets: `PlannerView.uxml` → `MainView.uxml`, `PlannerStyle.uss` → `MainStyle.uss` (경로: `KarmoToys/Main/UI`).
            - Tool Scripts: `Module/Tools/*.cs` → `KarmoToys/Features/ToolBox/Tools/`.
        - `Assets/Module` 폴더 완전 삭제로 프로젝트 구조 일원화.
        - UXML에서 USS 참조 경로 업데이트.
    - **반복 일정 편집 버그 수정**:
        - **블록 사라짐 문제**: `CreateBlockFromUI()` 메서드가 불완전하게 구현되어 날짜/시간/설명/태그가 복사되지 않았던 문제 수정. 이제 모든 필드를 UI에서 제대로 가져와 블록 생성.
        - **요일 설정 공유 문제**: 반복 일정이 아닌 블록을 열 때 요일 토글이 리셋되지 않아 이전 설정이 남아있던 문제 수정. `ShowEditDialog`에서 요일 토글 초기화 로직 추가.

## 2026-01-15 (KST)

- **플래너 시간 표시기 (Current Time Indicator)**:
    - **실시간 추적**: 스케줄 뷰에 현재 시간을 나타내는 가로 바를 추가하여 직관적인 시간 확인 가능.
    - **UXML 통합**: 표시 바를 `MainView.uxml`에 정적으로 정의하여 UI Builder 편집성과 런타임 성능 개선.
    - **호환성 수정**: 유니티 USS 미지원 속성(`z-index`, `pointer-events`)을 제거하고 `picking-mode` 및 계층 구조로 대체하여 에디터 경고 해결.

- **테마 시스템 고도화 (Theme System)**:
    - **Style Tokenization**: `ThemeTokens.uss` 파일을 신규 생성하여 색상 및 수치 변수를 중앙 관리. 테마 확장성 대폭 강화.
    - **Enum 기반 관리**: `Define.AppTheme` Enum을 도입하여 테마 관리의 타입 안정성 및 데이터 정합성 확보.
    - **리플렉션 기반 테마 전환**: `System.Reflection` 및 `Enum` API를 활용하여 새로운 테마 추가 시 코드 수정 없이 자동으로 인지하고 순환(Dark -> Light -> ...)하는 스마트 전환 시스템 구축.
    - **설정 보존**: 선택한 테마가 `KarmoToysData`에 저장되어 앱 재시작 시에도 유지되도록 구현.

- **시스템 클린업 & 버그 수정**:
    - **테마 토글 복구**: 유실되었던 테마 변경 버튼(`BtnThemeToggle`) 로직을 복구하고 최신 시스템에 연결.
    - **데이터 최적화**: `KarmoToysData.cs`에서 사용하지 않는 레거시 주석 및 템플릿 필드 정리.
    - **UI/UX**: 테마 변경 시 토스트 알림을 통해 변경 상태 피드백 제공.

- **인생의 주 (Life Weekly Visualizer) 구현**:
    - **핵심 컨셉**: 100세 인생을 5200개의 주차 블록으로 시각화하여 남은 시간을 체감할 수 있는 피처 구현.
    - **동적 그리드**: 수명(Target Age), 줄당 주차(Weeks Per Row) 설정을 실시간 반영하는 유연한 그리드 시스템.
    - **고성능 줌(Zoom) 최적화**: 5000개 이상의 블록을 개별 수정하는 대신 부모 요소의 `transform.scale`을 조작하여 쾌적한 확대/축소 성능 확보.
    - **UI/UX 개선**: 
        - 생일 입력을 년/월/일 분리형 필드로 개선하여 편의성 증대.
        - 메뉴바를 두 줄로 재구성하여 많은 옵션을 깔끔하게 배치.
        - 그리드 중앙 정렬 및 스크롤 영역 자동 계산 로직 적용.
    - **시각화 옵션**: 1년(생일 기준), 1년(달력 기준), 10년 단위의 강조 표시를 개별 토글 가능.

- **UI 서비스 아키텍처 리팩토링**:
    - **Core 네임스페이스 통합**: `ToastSystem`과 `TooltipService`를 `KarmoToys.Core` 네임스페이스로 이동하여 핵심 서비스 레이어 정립.
    - **네이밍 컨벤션 통일**: `ToastSystem` -> `ToastService`로 변경하여 일관성 확보.
    - **전역 툴팁 시스템**: UI Toolkit의 내장 `tooltip` 속성을 감지하여 별도의 설정 없이도 런타임 툴팁을 표시하는 범용 서비스 구축.

- **플래너 및 시스템 개선**:
    - **가독성 최적화**: 일정 블록의 텍스트 레이아웃을 통일하고, 툴팁 간섭 방지를 위해 내부 요소의 `pickingMode` 조정.
    - **시간 표시기 (Current Time Indicator)**: 실시간으로 현재 시간을 추적하여 스케줄 뷰에 가로 바 표시 (초 단위 동기화).
    - **테마 시스템**: `ThemeTokens.uss` 기반의 토큰 시스템 도입 및 리플렉션을 활용한 스마트 테마 전환 로직 구현.

- **빌드 도구 일반화 고도화 (Build Tool)**:
    - **패턴 기반 백업 시스템**: 패치(Deploy) 시 유실될 수 있는 중요 파일(세이브 등)을 보호하기 위해, 사용자 정의 패턴(`*.json;Data/` 등)에 기반한 자동 백업 및 복구 로직 구현.
    - **격리된 설계**: 특정 피처에 의존하지 않고 패턴 매칭을 통해 동작하므로 범용적인 활용 가능.
    - **UI 개선**: 보호할 패턴을 에디터 윈도우에서 직접 설정하고 저장할### 2026-01-15 (Backup System Improvements & Preferences Refactor)
- **백업 시스템 대규모 개편 (Backup System v9)**
    - **지능형 백업 트리거 (Deep Modification Detection)**: 단순 개수 변화뿐만 아니라, `TimeBlock`의 시간/제목 변경, `TodoItem`의 완료 여부/내용 변경, `SecretNote`의 상세 내용 변경까지 완벽하게 감지합니다.
    - **누적 변경 감지 (Cumulative Tracking)**: 마지막 저장 시점이 아닌, **마지막 백업 파일**과 비교하여 변경 사항을 누적 카운트합니다. 조금씩 수정해도 결국 임계치(Change Threshold)를 넘으면 백업됩니다.
    - **안전장치 (Fallback)**: 백업 파일이 없으면 즉시 초기 백업을 생성합니다. (InitBackup)
- **설정 탭 분리 (Preferences Refactor)**
    - **탭 분리**: 기존 `ToolBox`에 섞여 있던 앱 설정(테마, 백업 등)을 독립된 **Preferences(설정)** 탭으로 분리하여 UI 구조 개선.
    - **기능 이관**:
        *   Theme Control (Dark/Light)
        *   Backup Settings (AutoBackup, Threshold, MaxCount)
        *   Data Management (Open Folder, Reset, Refresh)
        *   Visual Diff (백업 비교)
    - **ToolBox 정화**: 도구함은 순수 유틸리티(텍스트 포맷터 등) 공간으로 재정립.
- **UI 구조 모듈화 (UXML Modularization)**
    - **컴포넌트 분리**: 거대해진 `MainView.uxml`을 기능별로 7개의 독립된 `.uxml` 파일로 분리. (`DashboardView`, `QuestBoardView`, `ScheduleView`, `LifeWeeklyView`, `SecretNoteView`, `ToolBoxView`, `PreferencesView`)
    - **유지보수성 향상**: 각 기능의 UI를 해당 Feature 폴더 내에서 독립적으로 관리 가능. `MainView`는 레이아웃과 인스턴스 조립만 담당.
- **스타일 모듈화 (USS Modularization)**
    - **스타일 분리**: `MainStyle.uss`에서 각 기능별 스타일을 분리하여 `FeatureStyle.uss`로 이동. (`DashboardStyle`, `QuestBoardStyle`, `ScheduleStyle`, `SecretNoteStyle`, `ToolBoxStyle`)
    - **구조 최적화**: 공통 스타일(Global)은 `MainStyle.uss`에 남기고, 기능별 스타일은 각 UXML 파일에서 직접 로드하도록 연결.
- **C# 데이터 및 로직 모듈화 (C# Modularization)**
    - **데이터 분리**: `KarmoToysData` 내에 뭉쳐있던 `PlannerData`를 기능별로 분리 (`DashboardData`, `QuestData`, `ScheduleData`, `NoteData`).
    - **마이그레이션 구현**: 기존 세이브 파일 호환성을 위해 `LegacyPlannerData`를 유지하고, 로드 시 `MigrateLegacyData`를 통해 신규 구조로 자동 이관되도록 구현.
    - **코드 리팩토링**: 각 Feature 클래스(`DashboardFeature`, `QuestBoardFeature` 등)가 더 이상 거대 `Planner` 데이터에 의존하지 않고, 본인의 전용 데이터 모듈을 사용하도록 변경.
 시 무조건 백업 생성하여 데이터 안전성 확보.
        - **변경량 감지 (Threshold)**: 일반 저장 시에는 변경 사항이 설정값(`Threshold`, 기본 10) 이상일 때만 백업하여 디스크 낭비 방지.
        - **누적 변경 추적**: 마지막 '저장'이 아닌 마지막 '백업'과의 차이를 비교하여, 소규모 수정을 반복해도 누적치가 임계점을 넘으면 백업되도록 버그 수정.
        - **정밀 감지**: 단순 개수 비교를 넘어 스케줄(TimeBlock)의 이동/리사이즈, 할 일(Todo)의 완료/수정, 비밀 노트의 내용 변경까지 감지.
    - **UI/UX 구현**:
        - **ToolBox 설정**: 자동 백업 여부(`AutoBackupOnSave`)와 민감도(`Threshold`)를 도구함에서 직접 설정 가능.
- **백업 시스템 대규모 개편 (Backup System v9)**:
    - **구조 단순화 (Flat Structure)**:
        - `Backups/{SaveId}/` 형태의 복잡한 폴더 구조를 `Backups/` 단일 폴더로 통합.
        - 파일명 기반 필터링으로 관리 로직 단순화 및 Cross-Save 브라우징 제거.
    - **지능형 트리거 (Smart Triggers)**:
        - **앱 생명주기 연동**: 앱 실행(Start) 및 종료(Quit) 시 무조건 백업 생성하여 데이터 안전성 확보.
        - **변경량 감지 (Threshold)**: 일반 저장 시에는 변경 사항이 설정값(`Threshold`, 기본 10) 이상일 때만 백업하여 디스크 낭비 방지.
        - **누적 변경 추적**: 마지막 '저장'이 아닌 마지막 '백업'과의 차이를 비교하여, 소규모 수정을 반복해도 누적치가 임계점을 넘으면 백업되도록 버그 수정.
        - **정밀 감지**: 단순 개수 비교를 넘어 스케줄(TimeBlock)의 이동/리사이즈, 할 일(Todo)의 완료/수정, 비밀 노트의 내용 변경까지 감지.
    - **UI/UX 구현**:
        - **ToolBox 설정**: 자동 백업 여부(`AutoBackupOnSave`)와 민감도(`Threshold`)를 도구함에서 직접 설정 가능.
        - **Visual Diff**: 백업 파일과 현재 상태의 변경 내역을 요약하여 보여주는 비교 기능 고도화.
    - **중복 방지**: MD5 해시 체크를 통해 내용이 동일한 중복 백업 생성 원천 차단.
- **컴패니언 모드 (Companion Mode) 구현**:
    - **투명 윈도우 시스템**: 유니티의 한계를 넘어선 **완전한 데스크탑 투명 오버레이** 구현.
        - **Windowed Mode Strategy**: 전체화면 모드의 제약을 우회하기 위해 창 모드(Windowed)로 시작 후, Win32 API(`user32.dll`, `dwmapi.dll`)를 사용하여 **테두리를 강제 제거**하고 **DWM 유리 효과**를 적용하는 하이브리드 방식 채택.
        - **Black Screen 해결**: URP 환경에서 발생하는 알파 채널 손실 문제를 해결하기 위해 `PlayerSettings.preserveFramebufferAlpha` 활성화 및 카메라 Post-Processing 강제 비활성화 로직 적용.
        - **Work Area Compliance**: 작업표시줄이 가려지는 문제를 방지하기 위해 `SystemParametersInfo(SPI_GETWORKAREA)`를 사용하여 **작업 영역(Work Area)에 딱 맞는 해상도**로 창 크기를 자동 조절.
    - **인터랙션 (Interaction)**:
        - **Input Passthrough**: 마우스가 캐릭터(UI) 위에 있을 때만 입력을 받고, 빈 공간에서는 **클릭이 바탕화면으로 통과**되도록 동적 히트 테스트 로직 구현.
        - **Always On Top**: 바탕화면을 클릭해도 창이 뒤로 숨지 않도록 `SetWindowPos`를 주기적으로 호출하여 최상단 유지.
    - **프로세스 아키텍처 (Process Architecture)**:
        - **Multi-Instance**: 메인 앱(`Planner`)과 컴패니언 앱(`Companion`)이 서로 독립된 프로세스로 동시에 실행될 수 있도록 구조화.
        - **Launch Argument**: `-mode companion` 인자를 통해 하나의 실행 파일로 두 가지 모드를 분기 처리.
        - **Mutex Protection**: `Global\KarmoLab_Main` 과 `Global\KarmoLab_Companion` 뮤텍스를 분리하여, **각 모드별로 단일 인스턴스**만 실행되도록 보호 (메인+컴패니언 공존 가능, 메인+메인 불가).
    - **에디터 도구**:
        - **Companion Build Helper**: 투명화에 필수적인 Player Settings(D3D11, FlipModel OFF 등)를 원클릭으로 설정하는 에디터 툴 제공.
        - **Build & Run**: 빌드 후 즉시 실행하여 빠른 테스트가 가능하도록 빌드 파이프라인 개선.
- **아키텍처 결정: 하이브리드 입력 시스템 (Hybrid Robust Input)**:
    - **문제점**: 윈도우가 비활성 상태이거나 투명 모드일 때, 유니티의 기본 이벤트 시스템(`Pick`, `OnPointerDown`)이 클릭을 제대로 감지하지 못하는 현상 발생.
    - **해결책**: `DwmExtendFrame` (시각적 투명화)와 **수동 입력 훅 (Manual Input Hooks)**을 결합한 하이브리드 방식 채택.
    - **원칙 (Rules)**:
        1. **투명화**: `DwmExtendFrameIntoClientArea` 사용. (알파 블렌딩과 비주얼 품질을 위해 Chroma Key 사용 금지).
        2. **입력 감지**: 드래그 시작은 반드시 `WindowTransparencyUtils.IsLeftMouseButtonDown()` (Win32 `GetAsyncKeyState`)를 사용하여 물리적인 마우스 상태를 체크.
        3. **히트 테스트**: 불확실한 `panel.Pick()` 대신, 화면 비율을 계산하는 `TransparencyHitTest.OverlapPoint()` (Manual Ratio Math) 사용.
- **컴패니언 모드 (Companion Mode) UI 및 안정성 강화**:
    - **인터랙션 로직 통합 (Unified Polling)**: UI Toolkit의 불안정한 이벤트(`PointerDown` 등) 대신 `Update` 루프에서 Win32 API로 마우스 상태를 직접 체크하는 폴링 방식을 채택하여 **클릭 씹힘 및 무한 루프 현상 완벽 해결**.
    - **버튼 연동 드래그 (Attached Panel)**: 설정창 드래그 기능을 제거하고 설정 버튼(⚙️)을 드래그할 때 창이 따라오도록 변경하여, 슬라이더 조작 시 원치 않는 창 이동 방지.
    - **해상도 명령행 인자 (CLI Resolution)**: `-width [px]`, `-height [px]`, `-fullworkarea` 인자를 지원하여 초기 실행 시 윈도우 크기 조절로 인한 번쩍임(Flicker) 제거.
- **아바타 시스템 고도화**:
    - **애니메이션 회전 누적(Drift) 방지**: `Root Motion` 비활성화 및 로컬 회전 초기화 로직을 통해 휴머노이드 애니메이션 전환 시 캐릭터가 조금씩 돌아가던 고질적 문제 해결.
    - **랜덤 대기 애니메이션 (Random Idle Loop)**: 캐릭터가 여러 대기 모션을 5~15초 간격으로 랜덤하게 재생하도록 업그레이드하여 생동감 부여.
    - **애니메이터 태그 스캐너 (Tag Scanner)**: 인스펙터 우클릭 메뉴(`Scan Animator by Tag`)를 통해 특정 태그가 붙은 애니메이션을 자동으로 수집하는 에디터 도구 구현.

## 2026-01-17 (KST)

- **KarmoEditor 툴바 기능 강화**:
	- **Custom Scene Selector**: Unity 6의 새로운 Toolbar API를 활용하여 에디터 상단에 씬 전환 드롭다운 메뉴 추가.
	- **데이터 기반 구성 (ScriptableObject)**: `ToolbarSceneConfig` 에셋을 통해 표시할 씬과 폴더를 자유롭게 설정 가능.
	- **자동 씬 검색**: 특정 폴더를 지정하면 해당 폴더 내의 모든 씬을 자동으로 드롭다운 메뉴에 포함.
	- **빠른 설정**: `KarmoTools/Create Toolbar Config` 메뉴를 통해 설정 파일을 원클릭으로 생성 가능.
	- **UX 개선**: 현재 활성화된 씬 이름을 드롭다운 타이틀에 표시하여 직시성 확보.
