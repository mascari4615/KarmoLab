# KarmoExtension

VS Code에서 특정 파일 확장자를 손쉽게 토글하여 숨기거나 표시할 수 있는 확장 프로그램임.

## 설치 방법 (GitHub)
1. 본 레포지토리의 **Releases** 페이지에서 최신 `.vsix` 파일을 다운로드함.
2. VS Code의 Extensions 탭(`Ctrl+Shift+X`)을 염.
3. 상단 `...` 메뉴의 **Install from VSIX...**를 클릭하고 다운로드한 파일을 선택함.

## 주요 기능
- **그룹화된 토글**: Unity Meta 파일, Temp 폴더, DotNet 프로젝트 파일 등을 그룹별로 제어 가능함.
- **On = Visible 로직**: 직관적인 스위치 조작 (켜면 보임).
- **폴더 제외 지원**: `Library`, `bin`, `obj` 등 대형 폴더도 즉시 숨김 가능함.
- **사이드바 GUI**: 전용 Explorer 뷰 제공.

## 사용 방법

1. **사이드바**: 왼쪽 로켓 아이콘을 클릭하여 Karmo Explorer를 염.
2. **토글**: 각 카드 옆의 스위치를 클릭하여 원하는 그룹을 숨기거나 표시함.
3. **전체 토글**: 하단 상태 표시줄의 아이콘을 클릭하여 모든 그룹을 일괄 토글함.
4. **설정 커스텀**: 사이드바 상단의 톱니바퀴 아이콘을 클릭하여 나만의 그룹과 패턴을 정의함.

## 개발 및 테스트

1. `Apps/karmo-vscode-extension` 폴더에서 `npm install` 실행함.
2. `F5`를 눌러 Extension Development Host 실행함.
3. 명령어 또는 버튼으로 작동 확인 바람.
