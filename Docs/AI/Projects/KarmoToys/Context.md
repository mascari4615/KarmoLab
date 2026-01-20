# KarmoToys Agent Context

Summary: KarmoToys 프로젝트 작업을 위한 필수 컨텍스트 및 규칙 모음.

> **Target Project**: `Unity/KarmoLab` (Content)
> **Base Persona**: `Docs/AI/Projects/KarmoToys/Implementer.md`

## 1. ⚠️ 절대 규칙 (Critical Rules)

> **[필독]** 이 컨텍스트는 `Docs/AI/Global/Common_Rules.md`를 상속받음.
> 해당 문서의 **언어(한국어), 안전성(빌드 필수), 스타일 규칙**을 먼저 숙지할 것.

### KarmoToys-Specific Rules

1. **동작 검증**: 모든 로직은 인게임 플레이 환경에서 정상 동작하는지 테스트되어야 함.

## 2. 🛠️ 기술 스택 (Tech Stack)

- **Engine**: Unity 6 (6000.3.2f1)
- **Language**: C#
- **UI**: UI Toolkit
  - **Note**: `z-index` 속성 미지원 (Hierarchy 순서로 렌더링 순서 결정).

## 3. 📂 참고 문서 (Context Links)

- **전역 아키텍처**: `Docs/Standards/Architecture_Overview.md`
- **로드맵**: `Docs/AI/Global/Backlog.md`
- **아이디어**: `Docs/AI/Projects/KarmoToys/Ideation.md`

## 4. 🚀 시작 가이드 (Start Guide)

1. 이 컨텍스트를 로드했다면, `KarmoToys.md`를 읽고 현재 필요한 게임 기능을 분석하라.
