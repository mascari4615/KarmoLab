# KarmoVSC-Ext 개요

## Summary

VS Code 프로젝트 탐색기의 가독성을 높이기 위해 불필요한 파일/폴더를 그룹 단위로 토글하는 생산성 도구.

## 주요 기능 (Features)

### 1. 그룹별 토글 (Grouped Toggle)

- 특정 성격의 파일/폴더들을 그룹으로 묶어 한 번에 제어함.
- **기본 프리셋**:
  - `Unity Meta Files`: `**/*.meta`
  - `C# Projects/Solutions`: `**/*.csproj`, `**/*.sln`, `bin/`, `obj/`
  - `Unity Library/Temp`: `Library/`, `Temp/`, `Logs/` 등
  - `Git Data`: `.git/`

### 2. 하이브리드 제어 (Hybrid Control)

- **Side Bar**: `Karmo Explorer` 웹뷰에서 전체 목록 확인 및 개별 그룹 토글.
- **Status Bar**: 하단 버튼 하나로 전체 그룹 일괄 토글 및 상태 확인.
- **Command Palette**: `Ctrl+Shift+P` 명령어로 빠른 실행.

### 3. 커스터마이징 (Customization)

- `Settings > Karmo Extension > Toggle Groups`에서 사용자가 직접 그룹을 생성하거나 패턴을 수정할 수 있음.

## 설치 방법 (Installation)

1. [GitHub Releases](https://github.com/mascari4615/KarmoLab/releases)에서 최신 `.vsix` 파일을 다운로드함.
2. VS Code의 Extensions 탭(`Ctrl+Shift+X`)에서 `...` 메뉴의 **Install from VSIX...**를 선택하여 설치함.

## 개발 가이드 (Development)

- **언어**: TypeScript, HTML, CSS (Vanilla)
- **로컬 빌드 및 설치 (`Build.ps1`)**:
  - `./Build.ps1`: TS 컴파일 및 VSIX 패키징.
  - `./Build.ps1 -Install`: 빌드 후 메인 VS Code에 즉시 클린 재설치.
  - `./Build.ps1 -DevCopy`: 프로젝트 파일을 익스텐션 폴더로 직접 복사 (개발용).
  - `./Build.ps1 -Open`: 설치된 확장 폴더를 탐색기로 즉시 열기.
- **표준 디버깅**: VS Code에서 `F5` 실행 (Extension Development Host).
- **패키징**: `npx vsce package`.
- **배포**: GitHub 전용 태그 푸시를 통한 자동 Publish.
