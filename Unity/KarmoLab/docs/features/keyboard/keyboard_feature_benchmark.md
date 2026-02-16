# Keyboard Overlay 프로그램 벤치마킹 보고서

Summary: KarmoLab 키보드 피처 고도화를 위해 선행 레퍼런스 3종(Carnac, NohBoard, Keyviz)을 소스 코드 수준에서 분석한 딥 리서치 보고서.

---

## 1. 분석 대상 개요

| 항목 | Carnac | NohBoard | Keyviz |
| :--- | :--- | :--- | :--- |
| **GitHub** | Code52/carnac | ThoNohT/NohBoard | mulaRahul/keyviz |
| **언어** | C# (.NET 4.5.2) | C# (.NET, WinForms) | Dart (Flutter) + Rust (v2) |
| **렌더링** | WPF | GDI+ | Skia (Flutter Engine) |
| **후킹** | `WH_KEYBOARD_LL` | `WH_KEYBOARD_LL` + `WH_MOUSE_LL` | OS별 네이티브 (Win32/CGEventTap/X11) |
| **플랫폼** | Windows | Windows | Windows, macOS, Linux |
| **라이선스** | MIT | GPL-2.0 | GPL-3.0 |
| **별** | ~4.1K | ~1.4K | ~6.5K |

---

## 2. Carnac — 소스 레벨 분석

### 2-1. 아키텍처: Rx 기반 4단 파이프라인

Carnac의 핵심은 **Reactive Extensions (Rx)** 를 사용한 이벤트 스트림 처리임. 데이터 흐름은 다음과 같음:

```
InterceptKeys → KeyProvider → MessageProvider → KeyShowView (WPF)
```

#### Layer 1: `InterceptKeys.cs` (Win32 Hook)

```csharp
// Observable.Create로 후킹 라이프사이클을 Rx 스트림에 바인딩
keyStream = Observable.Create<InterceptKeyEventArgs>(observer =>
{
    callback = (nCode, wParam, lParam) =>
    {
        if (nCode >= 0)
        {
            var eventArgs = CreateEventArgs(wParam, lParam);
            observer.OnNext(eventArgs);      // 이벤트를 Rx 스트림으로 방출
            if (eventArgs.Handled)
                return (IntPtr)1;            // 이벤트 소비 시 전파 차단
        }
        return Win32Methods.CallNextHookEx(hookId, nCode, wParam, lParam);
    };
    hookId = SetHook(callback);
    return Disposable.Create(() => {         // 구독 해제 시 자동 언훅
        Win32Methods.UnhookWindowsHookEx(hookId);
    });
}).Publish().RefCount();                       // Hot Observable로 공유
```

- **핵심**: `Publish().RefCount()`로 Hot Observable을 만들어 여러 구독자가 하나의 후킹 인스턴스를 공유함.
- **GC 방지**: `callback` 필드를 클래스 멤버로 유지하여 비관리 콜백의 GC 수집을 방지함.

#### Layer 2: `KeyProvider.cs` (이벤트 필터링/변환)

```csharp
interceptKeysSource.GetKeyStream()
    .Select(DetectWindowsKey)                 // Win키 상태 별도 추적
    .Where(k => !IsModifierKeyPress(k)        // 수식키 단독 이벤트 제외
             && k.KeyDirection == KeyDirection.Down)  // KeyDown만 취급
    .Select(ToCarnacKeyPress)                 // 프로세스 정보 바인딩
    .Where(keypress => keypress != null)       // 프로세스 못찾으면 무시
    .Where(k => !passwordModeService.CheckPasswordMode(k.InterceptKeyEventArgs))
```

- **프로세스 바인딩**: `GetForegroundWindow()` → `GetWindowThreadProcessId()`로 현재 활성 프로세스 이름과 아이콘을 키 이벤트에 첨부함. 이를 통해 프로세스명 기반 필터링을 지원함.
- **패스워드 모드**: 패스워드 입력 중임을 감지하면 키 기록을 중단하여 보안 사고를 방지함.
- **프로세스 필터**: `ProcessFilterExpression` 정규식을 컴파일하여 특정 앱에서만 캡처하도록 제한 가능.

#### Layer 3: `MessageProvider.cs` (스트림 병합/집계)

```csharp
keyProvider.GetKeyStream()
    .Scan(new ShortcutAccumulator(), (acc, key) => acc.ProcessKey(shortcutProvider, key))
    .Where(c => c.HasCompletedValue)           // 조합 완료된 것만
    .SelectMany(c => c.GetMessages())          // 여러 메시지로 분해
    .Scan(new Message(), (acc, key) => Message.MergeIfNeeded(acc, key))
    .Where(m => /* 설정에 따른 필터링 */);
```

- **`ShortcutAccumulator`**: 조합키 입력을 누적하며, 완성 여부를 판단함.
- **`Message.MergeIfNeeded`**: **1초 이내**에 같은 프로세스에서 입력된 비수식키는 하나의 메시지로 병합함.

#### Layer 4: `Message.cs` (데이터 모델)

```csharp
static bool ShouldCreateNewMessage(Message previous, Message current)
{
    return previous.ProcessName != current.ProcessName ||
           current.LastMessage.Subtract(previous.LastMessage) > OneSecond ||
           !previous.CanBeMerged ||
           !current.CanBeMerged;
}
```

- **병합 조건**: (1) 같은 프로세스, (2) 1초 이내, (3) 수식키가 아닌 일반 키.
- **연속 입력 카운터**: `RepeatedKeyPress` 내부 클래스가 동일한 키의 반복 횟수를 추적하여 `Backspace x 5` 형태로 출력함.
- **페이드아웃 모델**: `FadeOut()` 메서드로 삭제 예정 상태를 생성하고, UI에서 애니메이션을 수행함.

### 2-2. KarmoLab에 적용 가능한 인사이트

| Carnac 기능 | KarmoLab 현재 상태 | 적용 가능성 |
| :--- | :--- | :--- |
| 1초 기반 행 병합 | 타임스탬프 기반 행 분리 (`KeyboardRowSeparationThreshold`) | ✅ 이미 유사 로직 보유 |
| 연속 키 카운터 (`x N`) | 미구현 | ⭐ **높음** — 장문 삭제/방향키 사용 시 유용 |
| 프로세스별 아이콘 표시 | 미구현 | 중간 — 어떤 앱에서 입력했는지 표시 |
| 패스워드 모드 감지 | 미구현 | ⭐ **높음** — 보안 필수 |
| Rx 파이프라인 | ConcurrentQueue + Update 폴링 | 낮음 — 현재 방식이 Unity에 더 적합 |

---

## 3. NohBoard — 소스 레벨 분석

### 3-1. 아키텍처: 상태 기반 정적 레이아웃

NohBoard는 Carnac과 달리 스트림 방식이 아닌 **상태(State) 기반** 설계임.

#### 후킹: `HookManager.cs` (키보드 + 마우스 동시)

```csharp
// 키보드 훅 콜백
private static int KeyboardHookProc(int nCode, int wParam, IntPtr lParam)
{
    var info = (KeyboardHookStruct)Marshal.PtrToStructure(lParam, typeof(KeyboardHookStruct));
    var extended = (info.Flags & LLKHF_EXTENDED) != 0;
    var code = extended && info.VirtualKeyCode == VK_RETURN ? 1025 : info.VirtualKeyCode;

    switch (wParam)
    {
        case WM_KEYDOWN: case WM_SYSKEYDOWN:
            KeyboardState.AddPressedElement(code, PressHold);
            break;
        case WM_KEYUP: case WM_SYSKEYUP:
            KeyboardState.RemovePressedElement(code, PressHold);
            if (code == TrapToggleKeyCode) trapEnabled = !trapEnabled;
            break;
    }
    // TrapKeyboard가 활성화되면 return 1로 이벤트 전파 차단
    if (KeyboardInsert?.Invoke(code) ?? false || (trapEnabled && TrapKeyboard))
        return 1;

    return CallNextHookEx(keyboardHookHandle, nCode, wParam, lParam);
}
```

- **확장키 처리**: `LLKHF_EXTENDED` 플래그를 확인하여 NumPad Enter와 일반 Enter를 구분함 (코드 1025 부여).
- **마우스 동시 후킹**: `WH_MOUSE_LL`로 좌/우/중 클릭, 사이드 버튼(X1/X2), 마우스 휠(수직/수평), 마우스 이동까지 모두 캡처함.
- **입력 트랩**: `TrapKeyboard`/`TrapMouse` 플래그가 켜지면 `return 1`로 입력을 전파하지 않음 → 게임에서 특정 키를 비활성화하는 용도.

### 3-2. 렌더링: GDI+ 기반

- **DirectX에서 전환**: 초기에 DirectX를 사용했으나 OBS에서 Window Capture로 쉽게 잡히도록 GDI+로 전환함.
- **키 정의 파일**: JSON 형식으로 각 키의 위치(x, y), 크기(width, height), 라운드 코너 등을 정의함. 사용자가 직접 레이아웃을 편집하거나 커뮤니티에서 공유받을 수 있음.
- **스타일 시스템**: 키별로 배경색, 눌림 상태 배경색, 글꼴, 이미지를 지정할 수 있는 테마 시스템 보유.

### 3-3. KarmoLab에 적용 가능한 인사이트

| NohBoard 기능 | KarmoLab 현재 상태 | 적용 가능성 |
| :--- | :--- | :--- |
| 마우스 클릭/휠 시각화 | 미구현 | ⭐ **높음** — 마우스 상호작용 표시 추가 가능 |
| 확장키 구분 (NumPad) | 미구현 | 중간 — NumPad Enter 등 구분 필요 시 |
| 커스텀 레이아웃 (JSON) | 미구현 | 중간 — 향후 미니 키보드 모드 검토 시 참고 |
| 입력 트랩 기능 | 미구현 | 낮음 — KarmoLab의 목적에 부합하지 않음 |
| GDI+ → OBS 호환성 | Unity UIToolkit | 낮음 — Unity의 렌더링이 이미 OBS 호환 |

---

## 4. Keyviz — 아키텍처 분석

### 4-1. 아키텍처: Flutter + Rust 하이브리드

Keyviz v2는 UI를 Flutter(Dart), 코어를 Rust로 분리한 하이브리드 구조임.

#### 입력 캡처: OS별 네이티브 구현

| OS | API | 특이사항 |
| :--- | :--- | :--- |
| Windows | `SetWindowsHookEx` (`WH_KEYBOARD_LL`) | Win32 API 직접 호출 |
| macOS | `CGEventTap` | Accessibility 권한 필요 |
| Linux | X11 Extension | Wayland 미지원 |

- **Rust 코어**: 성능과 안정성을 위해 입력 후킹/처리를 Rust로 재작성함. Rust의 메모리 안전성과 크로스 플랫폼 빌드 능력을 활용.
- **Flutter UI**: Skia 렌더링 엔진을 통해 60fps 부드러운 애니메이션을 구현함.

### 4-2. 시각화 전략

- **조합키 병합 표시**: `Ctrl+Alt+Delete`를 개별 키가 아닌 하나의 병합된 블록으로 표시함.
- **애니메이션 시스템**:
  - 입장(Entry) 애니메이션: 키가 눌릴 때 등장하는 모션.
  - 퇴장(Exit) 애니메이션: 그라디언트 페이드아웃.
  - 지속 시간 설정: 사용자가 표시 유지 시간을 조절 가능.
- **마우스 액션**: 좌/우/중 클릭, 스크롤 업/다운을 커서 근처에 시각화함.
- **키 필터링**: 특정 키만 표시하거나 특정 키를 숨기는 핫키/커스텀 필터 지원.

### 4-3. 커스터마이징

- 스타일: 수식키/일반키 색상 분리, 크기, 테두리, 배경.
- 위치: 화면 내 자유 배치.
- 히스토리: 최근 입력 기록을 잔상처럼 유지하는 트레일(Trail) 모드.

### 4-4. KarmoLab에 적용 가능한 인사이트

| Keyviz 기능 | KarmoLab 현재 상태 | 적용 가능성 |
| :--- | :--- | :--- |
| 입장/퇴장 애니메이션 | 단순 opacity 페이드 | ⭐ **높음** — 시각적 완성도 향상 |
| 마우스 클릭 시각화 | 미구현 | ⭐ **높음** |
| 키 필터링 (특정 키만) | 미구현 | 중간 |
| 히스토리 트레일 모드 | 히스토리 행 존재 | 중간 — 현재 방식의 확장으로 구현 가능 |
| 수식키/일반키 색상 분리 | 미구현 | ⭐ **높음** — 가독성 향상 |

---

## 5. 종합 비교 및 KarmoLab 고도화 우선순위 제안

### 5-1. 기술 구현 비교

| 기술 요소 | Carnac | NohBoard | Keyviz | KarmoLab (현재) |
| :--- | :--- | :--- | :--- | :--- |
| 후킹 | `WH_KEYBOARD_LL` | `WH_KEYBOARD_LL` + `WH_MOUSE_LL` | OS별 네이티브 (Rust) | `WH_KEYBOARD_LL` |
| 이벤트 처리 | Rx Observable 스트림 | 정적 상태 갱신 | Rust 코어 → Flutter FFI | ConcurrentQueue → Update 폴링 |
| 행 병합 | 1초 타임윈도 + 프로세스 매칭 | N/A (정적 레이아웃) | 조합키 블록 병합 | `RowSeparationThreshold` 타임스탬프 |
| 연속 키 | `RepeatedKeyPress` (`x N`) | N/A | 미상 | 미구현 |
| 마우스 | 미지원 | 좌/우/중/사이드/휠/이동 | 클릭/스크롤 | 미지원 |
| 보안 | 패스워드 모드 감지 | 없음 | 없음 | 미구현 |

### 5-2. 고도화 우선순위 (권장)

| 우선순위 | 기능 | 레퍼런스 | 난이도 | 기대 효과 |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | 연속 키 카운터 (`Backspace x 5`) | Carnac | 낮음 | 장문 삭제/방향키 사용 시 가독성 개선 |
| **P0** | 패스워드 모드 감지 | Carnac | 중간 | 보안 사고 방지 |
| **P1** | 입장/퇴장 애니메이션 | Keyviz | 중간 | 시각적 완성도 대폭 향상 |
| **P1** | 수식키/일반키 색상 분리 | Keyviz | 낮음 | 가독성 향상 |
| **P2** | 마우스 클릭 시각화 | NohBoard/Keyviz | 높음 | 상호작용 피드백 확대 |
| **P2** | 프로세스별 필터링 | Carnac | 중간 | 특정 앱에서만 캡처 |
| **P3** | 커스텀 레이아웃 (미니 키보드) | NohBoard | 높음 | 게임 스트리밍 특화 |

---

*Last Updated: 2026-02-16*
