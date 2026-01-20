# Development Cheat Sheet

## PowerShell Commands

### Process Management
```powershell
# 실행 중인 KarmoHub 프로세스 강제 종료 (파일 잠금 해제)
Get-Process KarmoHub -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Build & Run (CLI)
```powershell
# Hub 빌드
dotnet build Apps/KarmoHub/KarmoHub.csproj

# Hub 실행
dotnet run --project Apps/KarmoHub/KarmoHub.csproj
```

### Git
```powershell
# 심볼릭 링크 활성화 (Windows 필수)
git config --global core.symlinks true
```
