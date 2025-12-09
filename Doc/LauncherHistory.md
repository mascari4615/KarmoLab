# KarmoTray 개발 히스토리

## 2025-12-09 (KST)

1. WPF 런처 프로젝트 환경 구축 완료 (`Launcher.csproj`, App/MainWindow, Tray/Game 서비스 뼈대).
2. 빌드 첫 성공 (별칭 충돌 해결 후).
3. 트레이 좌클릭 시 메인 창 열기 동작 추가.
4. 리소스 아이콘 `tray.ico` 적용.
5. 시작 프로그램 등록 기능 추가 (`StartupService`).

### 실행/빌드 시 사용한 주요 명령

```bash
# 빌드
cd KarmoLab
dotnet build Launcher/Launcher.csproj

# 실행
cd KarmoLab
dotnet run --project Launcher/Launcher.csproj

# 실행 중인 Launcher 프로세스 강제 종료 (파일 잠금 해제)
Get-Process Launcher -ErrorAction SilentlyContinue | Stop-Process -Force
```
