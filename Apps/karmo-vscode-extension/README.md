# KarmoVSC-Ext

VS Code에서 특정 파일 확장자를 손쉽게 토글하여 숨기거나 표시할 수 있는 확장 프로그램.

## 설치 방법 (GitHub)

1. 본 레포지토리의 **Releases** 페이지에서 최신 `.vsix` 파일을 다운로드.
2. VS Code의 Extensions 탭(`Ctrl+Shift+X`) 오픈.
3. 상단 `...` 메뉴의 **Install from VSIX...**를 클릭하고 다운로드한 파일을 선택.

## 설치 방법 (개발자용)

소스 코드를 수정하면 즉시 메인 VS Code와 Antigravity IDE에 반영됩니다.

1. `karmo-vscode-extension` 프로젝트 폴더에서 `npm install` 수행.
2. `scripts/setup-dev-link.ps1` 파일을 PowerShell에서 실행. (양쪽 IDE에 자동 링크 생성)
3. IDE에서 `Developer: Reload Window` 실행.

## 주요 기능

- **그룹화된 토글**: Unity Meta 파일, Temp 폴더, DotNet 프로젝트 파일 등을 그룹별로 제어 가능.
- **On = Visible 로직**: 직관적인 스위치 조작 (켜면 보임).
- **폴더 제외 지원**: `Library`, `bin`, `obj` 등 대형 폴더도 즉시 숨김 가능.
- **사이드바 GUI**: 전용 Explorer 뷰 제공.

## 사용 방법

1. **사이드바**: 왼쪽 로켓 아이콘을 클릭하여 Karmo Explorer 오픈.
2. **토글**: 카드 옆의 스위치로 그룹 제어.
3. **팁**: 수정 사항이 즉시 안 보인다면 `Reload Window`를 실행하세요.

## 효율적인 개발을 위한 팁

- **빌드 자동화**: 터미널에 `npm run watch`를 켜두면 파일을 저장할 때마다 자동으로 컴파일됩니다.
- **단축키**: `Developer: Reload Window`에 `Alt + R` 같은 단축키를 지정해 두면 소스 수정 후 즉시 확인이 가능합니다.
