# Refactoring Log: Documentation & Repository Organization (2026-01-17)

KarmoLab 리포지토리 문서 구조 개편 및 프로젝트 히스토리 분리 작업 기록 로그.

## 1. 개편 배경 및 목적
- **가독성 저해**: `KarmoToys`의 히스토리가 비대해져 특정 기능의 변경점을 찾기 어려움.
- **분류 모호성**: 기술 연구, 실전 매뉴얼, 공식 규칙이 섞여 있어 정보 탐색 효율이 낮음.
- **AI 협업 최적화**: AI 에이전트가 리포지토리 구조를 더 정확하게 파악하도록 지침 문서화.

## 2. 주요 변경 사항

### 2.1. 문서 3대 기둥(3 Pillars) 구조 도입
`Docs/` 폴더를 정보의 성격에 따라 3개 핵심 카테고리로 재구조화.

- **Standards (공식 규칙)**: `Architecture_Overview.md`, `Global_Instructions.md`, `Conventions/`
- **Guides (실전 매뉴얼)**: `CheatSheets/`, `Tutorials/`, `Workflows/`
- **Archive (지식 기록)**: `TechNotes/`, `Ideas/`
- **Projects (프로젝트 전용)**: 기존 `Apps/`, `Unity/` 문서를 프로젝트별 폴더로 통합.

### 2.2. 히스토리 파일 세분화 (History Refactoring)
비대해진 히스토리를 모듈 및 프로젝트별로 분리하여 관리 편의성 증대.

- `KarmoToys/History.md` → 기능별 분리:
    - [Companion Mode History](file:///Docs/Projects/KarmoToys/Features/Companion/History.md)
    - [Planner History](file:///Docs/Projects/KarmoToys/Features/Planner/History.md)
    - [LifeWeeklyVisualizer History](file:///Docs/Projects/KarmoToys/Features/LifeWeeklyVisualizer/History.md)
- [KarmoEditor History](file:///Docs/Projects/KarmoEditor/History.md) 추출.

### 2.3. 핵심 가이드라인 업데이트
- **Global_Instructions.md**: 파일명 변경(`GlobalInstructions.md` → `Global_Instructions.md`) 및 프로젝트 링크 최신화.
- **Markdown_Convention**: GitHub Flavored Markdown(GFM) 지원 규칙 추가 (체크리스트, 알림 문구 등).
- **Roadmap.md**: `Docs/` 루트로 이동 및 KarmoHub 관련 히스토리 통합 후 초기화.

### 2.4. 기타 최적화
- **README.md & Architecture_Overview.md**: 변경된 폴더 구조 반영 및 가상(Shared) 레퍼런스 제거.
- **AI 설정 동기화**: `.agent/GlobalRules.md` 및 `.github/copilot-instructions.md` 복사본 갱신.
- **빈 폴더 관리**: `Docs/Projects/YawnBot/` 등 비어있는 폴더에 `.gitkeep` 추가.

## 3. 향후 과제
- **심볼릭 링크 복구**: 관리자 권한으로 `.agent` 및 `.github` 설정 파일들을 `Global_Instructions.md`에 대한 심볼릭 링크로 전환 권장.
- **Shared 라이브러리 설계**: 추후 Unity와 WPF 간 코드 공유 필요 시 `Shared/` 폴더 설계 및 구현.
- **지속적인 컨벤션 업데이트**: 새롭게 추가되는 기술 스택에 맞춰 `Guides/` 확충.
- **지식 공유**: [Git & OS Basics](file:///Docs/Archive/TechNotes/Concepts_Git_OS_Basics.md) 문서를 통해 프로젝트에 쓰인 생소한 개념(Symlink, .gitkeep 등)들을 정리함.
