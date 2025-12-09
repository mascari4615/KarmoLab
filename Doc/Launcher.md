# Launcher/WPF 트레이 런처 개요

## AI는 이곳을 보라

- 빌드하고 실행 다시 해야 하는데, 이미 실행 중이라면?
  - `Get-Process Launcher -ErrorAction SilentlyContinue | Stop-Process -Force`로 강제 종료 가능 (파일 잠금 해제).
  - 위 명령 실행하고 대기할 것. (`Get-Process Launcher -ErrorAction SilentlyContinue | Stop-Process -Force; dotnet run --project Launcher/Launcher.csproj` 같이 바로 빌드/실행 시도하지 말 것)
- History 문서에 기록 잘 남길 것.

## 목표

- WPF 런처에서 Unity 실행/종료
- 트레이 아이콘으로 최소 UI 제공
- 필요 시 IPC(파이프/소켓) 확장

## 디렉터리 구조(추가됨)

```text
KarmoLab/
  Doc/
    Launcher.md          <- 본 문서
  Launcher/              <- WPF 런처 프로젝트 (트레이 + 프로세스 실행)
  Unity/...
```

## 빌드 & 실행(.NET 8 기준)

```bash
cd KarmoLab/Launcher
dotnet build
dotnet run
```

```bash
dotnet build Launcher/Launcher.csproj;
dotnet run --project Launcher/Launcher.csproj
```

이미 실행 중인 경우 `Get-Process Launcher -ErrorAction SilentlyContinue | Stop-Process -Force`로 종료 가능. (파일 잠금 해제)  

- 실행 전 `GameExecutablePath`를 실제 Unity exe 경로로 설정.
- 출력 경로: `Launcher/bin/Debug/net8.0-windows`

## 런처 동작 요약

- 시작 시 창 숨김, 트레이만 표시.
- 트레이 메뉴: 게임 실행, 메인 창 열기, 종료.
- 게임 실행은 `GameExecutablePath` exe를 `Process.Start`로 실행.
- 메인 창은 상태 표시용, 필요 시 설정 UI 확장.

## IPC 확장 아이디어

- 상태/명령 교환 필요하면 선택:
  - 네임드 파이프: Windows 한정, 단순/빠름
  - WebSocket/TCP(로컬): 크로스플랫폼, Unity C#에서 사용 쉬움
  - HTTP(127.0.0.1): 구현 쉽고 디버그 용이

## Unity 연동 가이드

- Unity 빌드 출력 경로 고정 또는 설정 UI로 변경 가능하게.
- 게임 종료 후에도 런처는 계속 실행, 재실행 가능.
- 런처 → Unity IPC: 게임 시작 시 파이프/소켓 서버 접속 시도.

## WPF를 선택한 이유 (WinForms 대비)

- DPI 대응/레이아웃 유연, 테마 확장 쉬움.
- MVVM 적용 용이해 규모 커져도 유지보수 용이.
- XAML로 UI 선언, 디자인/로직 분리.
- WinForms와 의존성 비슷, `NotifyIcon`도 그대로 사용 가능.

## 추가 자료

- WPF 빠른 튜토리얼: `Doc/WpfQuickstart.md`

## 다음 단계 제안

- `GameExecutablePath`를 설정 파일(JSON)로 분리, UI에서 수정 가능하게
- 실행 옵션 추가(작업 디렉터리, 인자 등)
- IPC 프로토콜 결정 후 런처/Unity 핸들러 추가
- 트레이 아이콘용 커스텀 .ico 등록
