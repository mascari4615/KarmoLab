# KarmoExtension History

## Summary

VS Code에서 특정 파일 확장자(Meta 파일 등)와 폴더를 그룹별로 손쉽게 토글하여 숨기거나 표시하는 확장 프로그램 개발 기록.

## 2026-01-18 (KST)

- **KarmoExtension 초기 개발 및 핵심 기능 구현**:
  - **파일 토글 엔진**: VS Code의 `files.exclude` 설정을 동적으로 조작하여 프로젝트 탐색기에서 특정 패턴의 파일을 즉시 숨기거나 표시하는 로직 구축.
  - **그룹 기반 토글 시스템**: 패턴들을 그룹(예: Unity Meta, DotNet Projects, Git Data 등)으로 묶어 개별적으로 제어할 수 있는 아키텍처 도입.
  - **폴더 제외 지원**: 파일뿐만 아니라 `Library/`, `Temp/`, `bin/`, `obj/` 등 대형 프로젝트 폴더까지 토글 범위 확장.

- **GUI 및 사용자 경험(UX) 최적화**:
  - **Karmo Explorer (Side Bar)**: 웹뷰(Webview) 기반의 전용 사이드바 뷰 구축. 세련된 카드 디자인과 토글 스위치 UI 제공.
  - **상태 표시줄 버튼 연동**: 하단 바 아이콘(`$(eye)`, `$(eye-closed)`)을 통해 현재 상태 확인 및 즉시 토글 지원. 사이드바와 실시간 양방향 동기화 구현.
  - **UI 폴리싱**:
    - **On = Visible 로직**: 사용자의 직관에 맞춰 스위치를 켜면 파일이 보이는 방식으로 로직 반전.
    - **초기 애니메이션 최적화**: 웹뷰 로드 시 스위치가 튀는 현상을 `no-transition` 클래스 제어로 해결하여 깔끔한 첫인상 구현.
    - **설정 바로가기**: 사이드바 내 톱니바퀴 아이콘으로 확장 프로그램 설정창 즉시 이동 지원.

- **프로젝트 리팩토링 및 유지보수성 향상**:
  - **관심사 분리 (SoC)**: `src/`에 몰려있던 웹뷰 HTML/CSS 코드를 `media/` 폴더로 외부 파일화하여 코드 가독성 및 관리 효율 증대.
  - **모노레포 대응 구조**: `Apps/karmo-vscode-extension` 하위로 자산을 격리하고 `.gitignore`, `LICENSE (MIT)` 등을 갖추어 배포 준비 완료.

- **CI/CD 자동화 및 배포 체계 구축**:
  - **VSIX 패키징**: `vsce`를 활용하여 확장 프로그램 배포 규격인 `.vsix` 파일 자동 생성 환경 구성 (v0.0.1, v0.0.2, v0.0.3 순차 배포).
  - **GitHub Actions 워크플로우**: 모노레포 환경을 고려한 자동 배포 파이프라인(`vscode-extension-publish.yml`) 구축.
  - **스마트 트리거**: 특정 경로(`Apps/karmo-vscode-extension/**`) 변경 시 및 전용 태그(`karmo-extension/v*`) 푸시 시에만 빌드 및 GitHub Release 자동 생성하도록 설정.
