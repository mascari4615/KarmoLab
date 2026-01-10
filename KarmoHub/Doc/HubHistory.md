# KarmoHub 개발 히스토리

## 2026-01-10 (KST) - KarmoHub 리브랜딩

1. 프로젝트 명 변경: `Launcher` -> `KarmoHub`.
2. 네임스페이스 및 주요 클래스 변경 완료.
3. 문서 파일 이름 변경 및 내용 업데이트 (`KarmoHub.md` 등으로).
4. **UI 개편**: 단순 버튼 식에서 사이드바 + 라이브러리 카드 뷰 형태로 변경.
5. **기능 확장**: `GameLibraryService` 추가 및 다중 게임 실행 지원 구조 마련.

## 2025-12-09 (KST) - 초기 프로토타입

1. WPF 런처 프로젝트 환경 구축 완료 (`Launcher.csproj`, App/MainWindow, Tray/Game 서비스 뼈대).
2. 빌드 첫 성공 (별칭 충돌 해결 후).
3. 트레이 좌클릭 시 메인 창 열기 동작 추가.
4. 리소스 아이콘 `tray.ico` 적용.
5. 시작 프로그램 등록 기능 추가 (`StartupService`).

### 실행/빌드 시 사용한 주요 명령

```bash
# 빌드
cd KarmoLab
dotnet build KarmoHub/KarmoHub.csproj

# 실행
cd KarmoLab
dotnet run --project KarmoHub/KarmoHub.csproj

# 실행 중인 KarmoHub 프로세스 강제 종료 (파일 잠금 해제)
Get-Process KarmoHub -ErrorAction SilentlyContinue | Stop-Process -Force
```
