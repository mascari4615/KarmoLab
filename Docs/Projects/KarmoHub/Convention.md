# KarmoHub (WPF) 개발 가이드

KarmoHub 프로젝트 개발 및 유지보수 준수 규칙 정의.

## 1. 빌드 및 실행 프로세스
**Launcher.exe** 실행 중에는 파일 잠금(Lock)으로 빌드 실패 가능성 존재. 코드 수정 후 빌드/실행 시 다음 절차 준수 필수.

### 1.1. 안전한 재실행 명령어 (PowerShell)
```powershell
# 1. 실행 중인 프로세스 강제 종료
Get-Process KarmoHub -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. 종료 확인 후 빌드 (연속 명령 사용 권장)
# 종료 명령과 빌드 명령을 세미콜론(;)으로 연결하여 순차 실행.
Get-Process KarmoHub -ErrorAction SilentlyContinue | Stop-Process -Force; dotnet build KarmoHub/KarmoHub.csproj
```

> **Warning**: 단순히 `dotnet run`만 입력하면 이전 프로세스가 종료되지 않아 "파일을 사용할 수 없습니다" 오류가 발생할 수 있음.

## 2. 코드 스타일
- **UI/Logic 분리**: MVVM 패턴 지향, View(.xaml)와 ViewModel(.cs) 분리.
- **비동기 처리**: UI 스레드 차단 방지를 위해 `async/await` 적극 활용.

## 3. UI/UX
- **시인성**: 텍스트와 배경의 명도 대비 확실히.
- **반응성**: 버튼 클릭 등 사용자 상호작용에 대해 즉각적인 시각적 피드백 제공
