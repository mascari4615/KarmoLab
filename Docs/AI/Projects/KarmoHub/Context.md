# KarmoHub Agent Context

Summary: KarmoHub 프로젝트 작업을 위한 필수 컨텍스트 및 규칙 모음.

> **Target Project**: `Apps/KarmoHub`
> **Base Persona**: `Docs/AI/Projects/KarmoHub/Implementer.md`

## 1. ⚠️ 절대 규칙 (Critical Rules)

> **[필독]** 이 컨텍스트는 `Docs/AI/Global/Common_Rules.md`를 상속받음.
> 해당 문서의 **언어(한국어), 안전성(빌드 필수), 스타일 규칙**을 먼저 숙지할 것.

### KarmoHub-Specific Rules

1. **UI 엔진**: 모든 UI 코드는 `MainWindow.xaml` 및 리소스 딕셔너리에 정의된 다이내믹 리소스를 활용해야 함.
2. **테마 무결성**: 새로운 UI 컴포넌트 추가 시 Obsidian, Monochrome, Light 세 가지 테마에서 모두 시각적으로 문제가 없는지 검증 필수.

## 2. 🛠️ 기술 스택 (Tech Stack)

- **Platform**: Windows (WPF) / .NET 8.0
- **Theme**: Custom Theme Service (Obsidian, Monochrome, Light)
- **Structure**:
  - `Views/`: XAML UI
  - `ViewModels/`: UI Logic
  - `Services/`: Business Logic
  - `Models/`: Data Structures

## 3. 📂 참고 문서 (Context Links)

- **전역 아키텍처**: `Docs/Standards/Architecture_Overview.md`
- **프로젝트 컨벤션**: `Docs/Projects/KarmoHub/Convention.md` (If exists)
- **백로그 목록**: `Docs/AI/Global/Backlog.md`
- **리소스 파일**: `Apps/KarmoHub/Resources/` (색상, 스타일)

## 4. 🚀 시작 가이드 (Start Guide)

1. 이 컨텍스트를 로드했다면, 가장 먼저 **현재 프로젝트가 빌드 가능한 상태인지** 확인하라.
2. `Docs/AI/Global/Backlog.md`에서 할당된 작업을 확인하고(없으면 요청), 작업을 시작하라.
