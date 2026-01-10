# KarmoHub 개요

## AI는 이곳을 보라

- 빌드하고 실행 다시 해야 하는데, 이미 실행 중이라면?
  - `Get-Process KarmoHub -ErrorAction SilentlyContinue | Stop-Process -Force`로 강제 종료 가능 (파일 잠금 해제).
  - 위 명령 실행하고 대기할 것. (`Get-Process KarmoHub -ErrorAction SilentlyContinue | Stop-Process -Force; dotnet run --project KarmoHub/KarmoHub.csproj` 같이 바로 빌드/실행 시도하지 말 것)
- History 문서에 기록 잘 남길 것.
- **프로젝트 이름 변경됨**: `Launcher` -> `KarmoHub`

## 목표

- 통합 게임/툴 플랫폼 (Hub)
- Unity 게임 및 각종 툴의 설치/실행 관리
- 트레이 아이콘 및 메인 대시보드 UI 제공

## 디렉터리 구조

```text
KarmoLab/
  Doc/
    KarmoHub.md          <- 본 문서
  KarmoHub/              <- WPF 프로젝트 (메인 Hub + 트레이 + 서비스)
  Unity/...
```

## 빌드 & 실행(.NET 8 기준)

```bash
cd KarmoLab/KarmoHub
dotnet build
dotnet run
```

```bash
dotnet build KarmoHub/KarmoHub.csproj;
dotnet run --project KarmoHub/KarmoHub.csproj
```

이미 실행 중인 경우 `Get-Process KarmoHub -ErrorAction SilentlyContinue | Stop-Process -Force`로 종료 가능. (파일 잠금 해제)  

- 출력 경로: `KarmoHub/bin/Debug/net8.0-windows`

## 동작 요약

- 시작 시 트레이 아이콘 등록 및 메인 대시보드 창 준비 (숨김 상태).
- 트레이 메뉴: KarmoHub 열기, 종료.
- 메인 대시보드: 라이브러리 목록 확인 및 실행, 상태 관리.
- 게임 실행은 `Process.Start`로 관리하며 다중 실행 방지/관리.
