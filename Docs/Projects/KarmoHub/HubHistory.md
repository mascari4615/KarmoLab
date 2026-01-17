# KarmoHub 개발 히스토리

## 2026-01-10 (KST) - 라이브러리 확장 및 안정화

1. **게임 라이브러리 확장**:
   - 신규 게임 추가: **'마녀: 귀찮아' (Witch Mendokusai)**.
   - 테스트용 '메모장' 항목 제거.
2. **다중 리포지토리 지원**:
   - `GameItem` 모델 개선: `RepoOwner`, `RepoName` 속성 추가.
   - 각 게임별로 서로 다른 GitHub 리포지토리의 Release 정보를 독립적으로 수신 가능하도록 변경.
3. **설치 경로 자동 보정**:
   - ZIP 파일 내 폴더 구조가 변경되어도 자동으로 `.exe`를 탐색하여 실행 경로를 보정하는 로직 추가 (`GameLibraryService`).
4. **안정성 개선**:
   - 앱 초기 구동 시 `MainWindow.Hide()` 호출로 인한 크래시 문제 해결.

## 2026-01-10 (KST) - 시스템 통합 및 언인스톨 기능

1. **사용자 수준 설치(User Scope Install) 적용**:
   - 설치 경로 변경: `BaseDirectory/Games` -> `%LocalAppData%/KarmoLab/Games`
   - 관리자 권한(UAC) 요구 없이 설치/업데이트/삭제 가능하도록 개선.
2. **Windows 시스템 통합**:
   - 레지스트리 등록: `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall`
   - **제어판/설정 앱 연동**: '프로그램 추가/제거' 목록에 게임 표시.
   - **시작 메뉴 바로가기**: `%AppData%\Microsoft\Windows\Start Menu\Programs\KarmoLab`에 바로가기 생성 (Windows 검색 노출).
   - `UninstallString`, `DisplayIcon`, `DisplayVersion` 등 메타데이터 등록.
3. **언인스톨러 구현**:
   - 실행 인자 `--uninstall {GameId}` 처리 로직 추가 (`App.xaml.cs`).
   - 삭제 시 레지스트리 키, 설치 폴더, 시작 메뉴 바로가기 일괄 정리.

## 2026-01-10 (KST) - 설치 시스템 구현 (Zero Setup)

1. **설치 관리자 (`GameInstallService`) 구현**:
   - 외부 인스톨러(`setup.exe`) 의존성 제거. Hub가 직접 다운로드/설치 관리.
   - GitHub Releases API 연동하여 최신 버전(.zip) 자동 감지.
   - **설치 프로세스**: `Download` (Stream) -> `Extract` (System.IO.Compression) -> `Deploy` (`/Games` 폴더).
   - 압축 해제 성능 최적화를 위해 복잡한 라이브러리 제거하고 순수 ZIP 방식으로 회귀.
2. **UI 기능 강화**:
   - **Log Console**: 하단에 실시간 로그(설치, 실행, 오류) 출력 창 추가.
   - **Folder Open**: 설치된 경로를 바로 여는 탐색기 연동 버튼 추가.
   - **Progress Feedback**: 다운로드 및 압축 해제 진행률의 정교한 시각화.
3. **버그 수정**:
   - 설치 경로 인식 오류 수정 (상대 경로 vs 절대 경로).
   - `.7z` 지원 시도 후 성능 문제로 ZIP 표준화 결정.

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


## Development Roadmap (KarmoHub)

### 🎯 최종 목표
- **KarmoHub**: 통합 런처. 게임 설치, 실행, 업데이트 관리.
- **배포 자동화**: GitHub Actions를 통해 빌드부터 배포까지 원클릭 처리.

### 📝 TODO 리스트 (Status Snapshot)

#### Phase 1: KarmoHub 자체 설치 기능 구현 (완료)
- [x] **GitHub API 연동**: `KarmoLab` 리포지토리의 최신 Release 정보(`version`, `asset url`) 가져오기.
- [x] **다운로드 및 설치 로직**:
  - `DownloadUrl`로 ZIP 파일 다운로드 (스트림 처리).
  - 설치 경로: `KarmoHub_Execution_Path/Games/{GameId}/`.
- [x] **UI/UX 개선**:
  - 설치 진행률 표시 (다운로드 % -> 압축 해제 %).
  - 설치 폴더 열기 기능.
  - 실시간 로그 콘솔 추가.

#### Phase 1.5: 시스템 통합 (완료)
- [x] **사용자 수준 설치 (User Scope Install)**
  - 설치 경로 변경: `AppData/Local/KarmoLab/Games`.
  - **Windows 레지스트리 등록**: 제어판/설정 앱 연동.

#### Phase 2: 배포 자동화 (GitHub Actions)
- [x] **Unity Build Action**: 클라우드 상에서 Unity 프로젝트 빌드.
- [ ] **Zip Artifact**: 빌드 결과물을 `.zip`으로 압축.
- [x] **Release Upload**: 자동으로 태그 생성하고 Release에 업로드 (`upm-publish.yml`).
