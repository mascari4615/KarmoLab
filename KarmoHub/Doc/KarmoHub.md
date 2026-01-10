# KarmoHub 개요

## 목표

- 통합 게임/툴 플랫폼 (Hub)
- Unity 게임 및 각종 툴의 설치/실행 관리
- 트레이 아이콘 및 메인 대시보드 UI 제공
- WinUI 3 기반 최신 Windows 11 스타일 지원

## 디렉터리 구조

```text
KarmoLab/
  Doc/
    KarmoHub.md          <- 본 문서
    HubHistory.md        <- 개발 히스토리
    WinUIQuickstart.md   <- WinUI 3 개발 패턴
  KarmoHub/              <- WinUI 3 프로젝트 (메인 Hub + 트레이 + 서비스)
  Unity/...
```

## 빌드 & 실행(.NET 8 기준)

```bash
cd KarmoLab/KarmoHub
Get-Process KarmoHub -ErrorAction SilentlyContinue | Stop-Process -Force; dotnet build
```

## 설치 및 데이터 경로

- **게임 설치 경로**: `%LocalAppData%\KarmoLab\Games` (사용자 별 격리 설치, 관리자 권한 불필요)
- **시작 메뉴 바로가기**: `%AppData%\Microsoft\Windows\Start Menu\Programs\KarmoLab`
- **설정/로그**: `bin` 폴더 또는 향후 `%AppData%` 이동 예정
- **시스템 연동**: 제어판 '프로그램 추가/제거' 및 Windows 설정 '설치된 앱'에 등록됨 (`HKCU` 레지스트리 사용)
- **출력 경로**: `KarmoHub/bin/Debug/net8.0-windows`

## 동작 요약

- **Core**: WinUI 3 (.NET 8) + H.NotifyIcon.WinUI (Tray)
- **Library**: `Games/` 폴더 내의 게임을 관리. GitHub Releases를 소스로 사용 (다중 리포지토리 지원)
- **Install**:
  1. GitHub API로 `latest` 또는 `pre-release` 태그 확인
  2. `.zip` 자산 다운로드 (Memory Stream -> File Stream)
  3. ZIP 내 폴더 구조 자동 탐색, `.exe` 경로 보정
  4. 설치 후 레지스트리/시작 메뉴/제어판 연동
- **Play**: `Process.Start`로 자식 프로세스 실행. 종료 이벤트 감지하여 상태(Status) 갱신
- **Uninstall**: 실행 인자 `--uninstall {GameId}`로 레지스트리/폴더/바로가기 일괄 삭제

## 주요 기능

1. **Zero-Setup Install**: 별도 설치 과정 없이 Hub에서 다운로드 버튼만 누르면 설치 완료 (Portable 방식)
2. **Auto-Update Check**: 실행 시 혹은 라이브러리 로드 시 GitHub와 버전 비교
3. **Log System**: 설치 및 실행 과정에 대한 투명한 로그 제공
4. **다중 리포지토리 지원**: 각 게임별로 독립적인 GitHub Release 관리
5. **시스템 통합**: 제어판/설정 앱/시작 메뉴 연동, 사용자 수준 설치
6. **UI/UX**: 카드형 그리드, 사이드바, Mica 효과, 커스텀 타이틀바, 자유 Resize

## 참고 문서

- [HubHistory.md](HubHistory.md): 개발 히스토리 및 주요 변경점
- [WinUIQuickstart.md](WinUIQuickstart.md): WinUI 3 개발 패턴 및 빌드/실행 방법

---

최신 스펙 및 개발 히스토리는 HubHistory.md에서 확인하세요.
WinUI 3 개발 패턴은 WinUIQuickstart.md 참고.
