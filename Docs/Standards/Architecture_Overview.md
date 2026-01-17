# Architecture Overview (전체 구조도)

## 1. Repository Structure (Option C)
- **Unity/**: 유니티 프로젝트 및 패키지
    - `KarmoLab/`: 메인 유니티 프로젝트 (KarmoToys, KarmoEditor 포함)
    - `LocalPackages/`: 프로젝트 간 공유되는 유니티 패키지
- **Apps/**: 일반 애플리케이션 (Unity 외 프로젝트)
    - `KarmoHub/`: WPF 런처
    - `YawnBot/`: 봇 프로젝트
- **Docs/**: 통합 문서 저장소 (3대 기둥)
    - **`Roadmap.md`**: 프로젝트 전체 이정표
    - **`Standards/`**: 공식 규칙 및 가이드라인 (What we must follow)
        - `Architecture_Overview.md`: 전체 구조도
        - `Global_Instructions.md`: 전역 지침
        - `Conventions/`: 코드/문서 작성 규칙
    - **`Guides/`**: 실전 매뉴얼 및 워크플로우 (How to do things)
        - `CheatSheets/`: 핵심 명령어 모음
        - `Tutorials/`: 단계별 튜토리얼
        - `Workflows/`: 반복적인 작업 절차
    - **`Archive/`**: 기술 연구 및 지식 창고 (Why/How it works)
        - `TechNotes/`: 구현 상세 및 알고리즘 연구
        - `Concepts_Git_OS_Basics.md`: 개발 기초 개념 정리 (Symlink, .gitkeep 등)
        - `Ideas/`: 기획 및 기능 구상
    - **`Projects/`**: 각 프로젝트별 세부 문서 (History, Convention 등)
- **Lab/**: 실험 및 학습용 폴더 (Playgrounds, Study)

## 2. Key Projects
- **KarmoHub (WPF)**: Prism/MVVM 패턴 기반 게임 런처 및 설치기.
- **KarmoLab (Unity)**: `KarmoToys` 모듈형 아키텍처 기반 메인 게임 프로젝트. UI Toolkit 적극 활용.
- **KarmoToys**: `KarmoLab` 내부 핵심 기능 모듈 시스템.
