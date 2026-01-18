# Changelog

## [1.1.0] - 2026-01-18

### Added

- **Project Settings 통합**: `Edit > Project Settings > KarmoLab`에서 모든 설정 관리 가능.
- **유니티 검색(Search) 통합**: `kl:` 접두사로 기능 검색 및 실행 지원.
- **초기 설정 마법사(Welcome Wizard)**: 패키지 설치 시 자동 온보딩 지원.
- **커스텀 인스펙터**: `ReorderableList` 적용으로 씬/뮤텍스 목록 편집 편의성 증대.
- **에디터 단축키**: 빌드(Ctrl+Alt+B), 뮤텍스(Ctrl+Alt+M), 설정(Ctrl+Alt+K) 단축키 추가.

### Changed

- 패키지 루트 메뉴를 `KarmoLab/KarmoEditor/` 계층 구조로 개편.
- 로그 접두사를 `[KarmoEditor]` 공용 상수로 통일.
- 에셋 기본 저장 경로를 `Assets/KarmoLab/Settings`로 정규화.
- `KarmoEditorSettings` 명칭을 `KarmoSettings`로 간소화.

## [1.0.0] - 2026-01-17

### Added

- 초기 버전 출시 (Build Helper, Mutex Killer, Scene Selector 기초 기능 포함).
