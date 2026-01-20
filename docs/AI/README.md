# 🦾 AI 작업 공간 (AI Workspace)

Summary: KarmoLab AI 작업 공간의 전체 구조와 사용 가이드라인.

이곳은 KarmoLab의 모든 AI 에이전트와 관리 시스템이 통합된 공간임.
프로젝트 중심(Project-centric) 구조로 설계되어, 특정 프로젝트 전담 에이전트가 즉시 업무에 투입될 수 있도록 최적화됨.

## 📂 전체 구조 (Structure)

### 1. 🌐 [Global/](file:///c:/Users/masca/source/repos/KarmoLab/Docs/AI/Global/)

- 모든 프로젝트에 공통적으로 적용되는 규칙과 팀 관리 도구.
- **[common-rules.md](file:///c:/Users/masca/source/repos/KarmoLab/Docs/AI/Global/common-rules.md)**: 언어, 빌드, 스타일 등 절대 지침.
- **[roster.md](file:///c:/Users/masca/source/repos/KarmoLab/Docs/AI/Global/roster.md)**: 전체 팀 명단.
- **[backlog.md](file:///c:/Users/masca/source/repos/KarmoLab/Docs/AI/Global/backlog.md)**: 통합 백로그.

### 2. 🏛️ [Projects/](file:///c:/Users/masca/source/repos/KarmoLab/Docs/AI/Projects/)

- 각 프로젝트별 응집된 데이터와 에이전트 정보.
- **[KarmoHub](file:///c:/Users/masca/source/repos/KarmoHub/)**: 런처 관련 컨텍스트 및 에이전트.
- **[YawnBot](file:///c:/Users/masca/source/repos/YawnBot/)**: 디스코드 봇 관련.
- **[KarmoToys](file:///c:/Users/masca/source/repos/KarmoToys/)**: 유니티 게임 콘텐츠.
- **[KarmoEditor](file:///c:/Users/masca/source/repos/KarmoEditor/)**: 유니티 에디터 도구.
- **[KarmoVSC](file:///c:/Users/masca/source/repos/KarmoVSC/)**: VSCode 확장 프로그램.
- **[Alisa/](file:///c:/Users/masca/source/repos/KarmoLab/Docs/AI/Projects/Alisa/)**: 비서(PM) 전용 공간 ([Profile](Alisa/Secretary.md), [Services](Alisa/Services.md)).

## 🚀 사용 가이드 (Quick Start)

새로운 대화를 시작할 때, 해당 프로젝트 폴더 내의 `Context.md`를 로드하면 됨.

- 예: "KarmoHub 작업을 할 거야. `Docs/AI/Projects/KarmoHub/Context.md`를 읽고 시작해."

> *관리 주체: Alisa (Personal Secretary & PM)*
