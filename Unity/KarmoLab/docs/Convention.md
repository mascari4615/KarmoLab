# 네이밍 컨벤션 가이드 (Naming Convention Guide)

Summary: KarmoLab 및 KarmoToys 프로젝트의 일관성을 위한 브랜드, 패키지 및 코드 네이밍 규칙.

## 1. 브랜드 & 창작자 정보

고정 명칭 사용.

- **Brand Name**: `KarmoDDrine` (카모뜨린)
- **Primary ID**: `Mascari4615`
- **소문자가 필요한 경우**: `karmoddrine`, `mascari4615`

## 2. 패키지 & 리포지토리 (Technical IDs)

컴퓨터 인식 식별자는 **소문자 + kebab-case** 사용.

- **Package ID**: `com.mascari4615.karmo-editor`
- **Git Branch**: `upm/karmo-editor` (패키지 배포용)
- **Folder (LocalPackages)**: `com.mascari4615.karmo-editor`

## 3. 코드 & 아키텍처 (C#)

C# 표준 관례에 따라 **PascalCase**를 사용합니다.

- **Namespace**: `KarmoLab.KarmoEditor`
  - 하위 모듈이 있을 경우: `KarmoLab.KarmoEditor.Build`, `KarmoLab.KarmoEditor.Toolbar`
- **Menu Path**: `KarmoLab/` (유니티 상단 메뉴 바)
- **Class/Method/Property**: `PascalCase`
- **Private Fields**: `_camelCase` (언더바 접두사)

## 4. 파일 & 폴더 (Assets)

- **Documentation**: `Doc/KarmoEditor` (주제/카테고리명은 PascalCase 권장)
- **Unity Assets**: `PascalCase` (예: `Settings/ToolbarSceneConfig.asset`)
- **JSON/Configs**: `camelCase` 또는 `kebab-case` (용도에 따라 선택)

## 5. UI Toolkit

### 5.1. 스타일 관리 (Styling)

- **개별 스타일 권장**: 각 UXML 파일은 자신의 쌍이 되는 USS 파일을 `<ui:Style>` 태그로 직접 포함하는 것을 권장함. (경로가 짧고 모듈화가 용이함)
- **TSS 최소화**: `MainTheme.tss`는 전역 토큰(`ThemeTokens.uss`) 및 기본 공통 스타일(`MainStyle.uss`) 등 프로젝트 전반에 걸친 공통 항목만 관리함.

### 5.2. UI 레이아웃 (Layout)

- **높이 확장**: 프로젝트 전체 화면을 사용하는 서브 뷰(UXML Template)의 경우, 반드시 `.stretch-container` 클래스를 **래퍼, 인스턴스, 자식 루트** 3단계에 모두 적용하여 `TemplateContainer`에 의한 높이 단절을 방지함.

## 6. 요약: "인간은 Pascal, 기계는 kebab"

- **사람이 읽는 곳**(메뉴, 가이드 폴더, 클래스 이름): `KarmoEditor`
- **시스템이 읽는 곳**(패키지 ID, 브랜치 주소, 폴더 ID): `karmo-editor`

> **참고**: 이 가이드는 `Docs/Standards/Conventions/naming-convention.md`를 기반으로 함.
