# Companion Mode History

## 2026-01-18 (KST)

- **실행 진입점 및 관리 체계 리팩토링 (Launch System Refactor)**:
  - **서비스 분리**: 컴패니언 실행 로직을 `ToolBox`에서 `CompanionService`로 분리 및 독립 클래스화.
  - **메인 앱 통합**: 메인 프로그램 시작 시 컴패니언 자동 실행 기능을 추가하여 실행 단계 간소화.
  - **AppMode 표준화**: `-mode companion` 커맨드라인 인자 파싱을 `AppMode` Enum 기반으로 표준화하여 확장성 확보.

- **UI 개선 (Toolbar Navigation)**:
  - 헤더에 전용 토글 버튼(👤)을 추가하고 테마 버튼과 가로로 정렬하여 실시간 소환/해제 기능 제공.

## 2026-01-15 (KST)

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
