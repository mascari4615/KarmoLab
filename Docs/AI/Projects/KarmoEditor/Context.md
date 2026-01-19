# KarmoEditor Agent Context

Summary: KarmoEditor 프로젝트 작업을 위한 필수 컨텍스트 및 규칙 모음.

> **Target Project**: `Unity/KarmoLab` (Editor Tools)
> **Base Persona**: `Docs/AI/Projects/KarmoEditor/Implementer.md`

## 1. ⚠️ 절대 규칙 (Critical Rules)

> **[필독]** 이 컨텍스트는 `Docs/AI/Global/Common_Rules.md`를 상속받음.
> 해당 문서의 **언어(한국어), 안전성(빌드 필수), 스타일 규칙**을 먼저 숙지할 것.

### KarmoEditor-Specific Rules

1. **에디터 무결성**: 에디터 스크립트가 런타임 빌드에 포함되지 않도록 `Editor` 폴더 관리에 주의할 것.

## 2. 🛠️ 기술 스택 (Tech Stack)

- **Engine**: Unity 6 (6000.3.2f1)
- **Language**: C# (Editor Scripting)
- **UI**: UI Toolkit (Editor UI)

## 3. 📂 참고 문서 (Context Links)

- **전역 아키텍처**: `Docs/Standards/Architecture_Overview.md`
- **아이디어**: `Docs/AI/Projects/KarmoEditor/Ideation.md`
- **패키지**: `Unity/LocalPackages/com.mascari4615.karmo-editor/`

## 4. 🚀 시작 가이드 (Start Guide)

1. 이 컨텍스트를 로드했다면, `KarmoEditor.md`를 읽고 개발자 워크플로 개선 사항을 확인하라.
