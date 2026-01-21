# Companion Mode (Transparent Window) Design

## 1. 개요 (Overview)

이 문서는 KarmoToys 유니티 앱 **Companion Mode**(배경 투명 캐릭터 창) 구현 검토 및 설계 내용 정리.

## 2. 구현 가능성 분석 (Feasibility Analysis)

### 2.1. 유니티 멀티 윈도우의 한계

Unity 기본 `Multi-Display` 또는 `WindowManager` API는 모니터 확장에 초점이 맞춰져 있어, 단일 모니터 내 **독립적 투명 윈도우** 다수 생성은 기술적으로 제한적임.

### 2.2. 해결 방안: 멀티 프로세스 아키텍처 (Multi-Process Architecture)

**메인 앱(`Planner`)**과 **캐릭터 앱(`Companion`)**을 별도 프로세스(인스턴스)로 분리 실행하는 방식 채택.
동일 실행 파일(`KarmoLab.exe`) 사용하되, 실행 시 **Command Line Argument**로 모드 구분.

- **Main Mode**: 기존 플래너/대시보드 앱 (불투명, 일반 윈도우).
- **Companion Mode**: 캐릭터만 표시되는 앱 (투명, Always On Top, 프레임리스).

이 방식은 각 윈도우를 OS 레벨에서 완전히 독립적으로 제어할 수 있어 가장 안정적이고 확실한 해결책.

## 3. 기술 설계 (Technical Design)

### 3.1. 진입점 설계 (Entry Point)

애플리케이션 시작 시(`KarmoToysApp.Awake`), 커맨드 라인 인자를 파싱하여 실행 모드를 결정함.

```csharp
// 예시 로직
string[] args = System.Environment.GetCommandLineArgs();
bool isCompanionMode = args.Contains("-mode companion");

if (isCompanionMode)
{
    // Companion 모드 초기화 (투명화, UI 숨김 등)
    InitializeCompanion();
}
else
{
    // 기존 Planner 초기화
    EnsureFeatures();
}
```

### 3.2. 윈도우 투명화 구현 (Windows API)

Windows OS 환경에서 윈도우 배경을 투명하게 만들기 위해 `User32.dll`과 `Dwmapi.dll`을 사용함.

#### 3.2.1. 필수 설정 (Player Settings)

투명화가 정상 작동하기 위해서는 유니티 빌드 설정이 선행되어야 함.

- **Graphic API**: `Direct3D11` (Forced).
- **Fullscreen Mode**: `Windowed` (전체화면 모드는 DWM 충돌로 인해 지양).
- **Use Flip Model Swapchain**: **OFF** (D3D11에서 투명화 지원을 위해 필수 해제).
- **Preserve Framebuffer Alpha**: **TRUE** (매우 중요: 활성화하지 않으면 배경이 검은색으로 나옴).
- **URP Settings**:
  - **HDR**: Disabled (URP Asset).
  - **Post-Processing**: Disabled (Camera Data).

#### 3.2.2. Native API 적용 (Windowed Mode Strategy)

일반 창(`Windowed`)으로 시작한 뒤, OS 레벨에서 테두리를 제거하고 투명화를 적용하는 방식을 사용함.

1. **Work Area Resizing**: `SystemParametersInfo(SPI_GETWORKAREA)`를 통해 작업표시줄을 제외한 화면 크기로 창 크기 설정.
2. **Border Stripping**: `WS_CAPTION`, `WS_THICKFRAME` 등의 스타일을 제거하고 `WS_POPUP` 스타일 적용.
3. **Transparency**: `DwmExtendFrameIntoClientArea` API를 호출하여 클라이언트 영역 전체를 Glass(투명) 처리.
4. **Always On Top**: `SetWindowPos`를 통해 `HWND_TOPMOST` 적용 (주기적으로 재적용하여 풀림 방지).

### 3.3. 인터랙션 (Interaction)

캐릭터는 바탕화면 위에 떠 있어야 하지만, 마우스 입력도 받아야 함.

- **Dynamic Click-through (동적 클릭 통과)**:
  - `CompanionFeature`의 `Update` 루프에서 마우스 위치에 캐릭터 UI(VisualElement)가 있는지 `Pick()` 메서드로 확인함.
  - **Hit**: `SetClickThrough(false)` -> 입력 차단 (캐릭터와 상호작용).
  - **No Hit**: `SetClickThrough(true)` -> 입력 통과 (바탕화면 클릭 가능).
  - 이 방식은 픽셀 단위 알파 검사보다 성능이 우수하고 구현이 간편함.

## 4. 아키텍처 및 데이터 흐름

### 4.1. 프로세스 분리 (Process Separation)

- **Main App**: `Global\KarmoLab_Main` Mutex로 보호.
- **Companion App**: `Global\KarmoLab_Companion` Mutex로 보호.
- 서로 다른 Mutex를 사용하므로 두 앱이 동시에 실행될 수 있음.

### 4.2. 실행 흐름

1. **Main App**: 버튼 클릭 시 `System.Diagnostics.Process.Start`로 자기 자신(`KarmoLab.exe`)을 `-mode companion` 인자와 함께 실행.
2. **Companion App**: `Awake`에서 모드 감지 -> 해상도 조정(Work Area) -> 투명화 적용 -> UI 로드.

## 4. 기능 명세 (Feature Specifications)

### 4.1. 메인 앱 기능

- **소환 버튼**: [도구함] 또는 헤더에 "캐릭터 소환" 버튼 추가.
  - 클릭 시 `KarmoLab.exe -mode companion` 프로세스 실행.
  - 이미 실행 중이라면 중복 실행 방지.

### 4.2. Companion 앱 기능

- **캐릭터 렌더링**: Spine/Live2D 또는 3D 모델 캐릭터 표시.
- **제스처 반응**:
  - **클릭/터치**: 랜덤 애니메이션 또는 대사 출력 (말풍선).
  - **드래그**: 윈도우 위치 이동.
- **우클릭 메뉴**:
  - **종료**: Companion 모드 종료.
  - **크기 조절**: 캐릭터 크기(윈도우 크기) 조절.
  - **항상 위 해제**: `Always On Top` 토글.

### 4.3. 3D Model Strategy: VRM vs Humanoid

3D 캐릭터 도입 시 고려할 포맷 비교를 정리함.

| 분류 | **VRM (Virtual Reality Model)** | **Generic Humanoid (FBX)** |
| :--- | :--- | :--- |
| **목적** | **'아바타'** (인격체) 표현에 특화 | **범용 3D 캐릭터** (게임/애니메이션) |
| **표정** | **BlendShape 표준화** (Joy, Angry, Sorrow, Fun, Blink 등) | 모델마다 제각각 (직접 매핑 필요) |
| **물리** | **SpringBone** 내장 (머리카락, 옷자락 등 자동 설정) | Dynamic Bone / Cloth 등 별도 세팅 필요 |
| **쉐이더** | **MToon** 표준 (카툰 렌더링 최적화) | Standard / URP Lit 등 직접 설정 |
| **호환성** | VSeeFace, VRChat 등 다양한 앱과 호환 가능 | 유니티 내부에서만 통용 |
| **결론** | **Companion 앱에는 VRM이 압도적으로 유리함.** (별도 세팅 없이 표정/물리 즉시 적용 가능) | 커스텀 애니메이션 제작엔 유리하나 손이 많이 감 |

## 5. 추가 기능 로드맵 (Roadmap 2.0)

### 단계 1: 인터랙션 강화 (Immediate)

- [ ] **Drag & Drop**: 마우스로 캐릭터를 잡아 이동 (구현 예정).
- [ ] **Speech Bubble**: 텍스트 말풍선으로 대화 기능 추가.

### 단계 2: 비주얼 업그레이드 (Humanoid Focus)

- [ ] **Generic Humanoid Support**: 기존 보유 중인 Humanoid 모델(FBX) 연동.
- [ ] **Animations**: 기본 Animator Controller 구성 (Idle, Walk, Dragged).

### 단계 3: 미래 아이디어 (Backlog)

- [ ] **VRM Support**: 추후 호환성 확장 (UniVRM).
- [ ] **Window Sitting**: 활성화된 창 위에 앉기.
- [ ] **Gravity**: 바닥으로 떨어지기.
- [ ] **Chat GPT**: 대화형 AI 연동.
