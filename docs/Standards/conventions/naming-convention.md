# Naming Convention (네이밍 규칙)

Summary: KarmoLab 리포지토리 파일 및 폴더 명명 규칙 가이드.

KarmoLab 리포지토리 파일 및 폴더 명명 규칙.

## 1. 주요 케이스 종류

- **PascalCase**: `MyFileName.cs` (각 단어의 첫 글자를 대문자로 표기)
- **kebab-case**: `my-file-name.js` (소문자와 하이픈`-` 사용)
- **snake_case**: `my_file_name.py` (소문자와 언더바`_` 사용)

## 2. KarmoLab 표준 규칙

KarmoLab은 .NET 및 Unity 환경 기반이므로, 해당 생태계 관습 우선시.

### 2.1. 폴더 (Folders)

- **표준**: **PascalCase**
- **이유**: .NET 네임스페이스 및 Unity 프로젝트 구조 일관성 유지.
- **예시**: `Apps/`, `Unity/`, `KarmoHub/`, `Standards/`, `Conventions/`
- **예외**: 시스템 폴더(`.github`, `.vscode`)는 해당 플랫폼 표준(보통 kebab-case) 따름.

### 2.2. 소스 코드 (Source Code)

- **표준**: **PascalCase**
- **이유**: C# 클래스 명명 규칙과 파일명 일치.
- **예시**: `MainWindow.xaml.cs`, `GameService.cs`

### 2.3. 문서 (Documentation - `.md`)

- **표준**: **PascalCase** 또는 **Pascal_Snake_Case** (혼용 허용되나 PascalCase 권장)
- **일반 문서**: **PascalCase** (`ArchitectureOverview.md`, `Roadmap.md`)
- **핵심 허브 문서**: 가독성을 위해 언더바(`_`)를 섞은 **Pascal_Snake_Case** 허용 (`global-instructions.md`)
- **이유**: 윈도우 환경에서 가독성이 좋으며, 대소문자 구분이 명확하지 않은 시스템에서도 안전함.

### 2.4. 에셋 및 리소스 (Assets/Resources)

- **Unity**: Unity 엔진 권장 가이드(PascalCase) 따름.
- **Web/Hub**: 아이콘 등 외부 노출 리소스는 **kebab-case** 사용 권장.

1. **일관성 (Consistency)**: 누가 보더라도 "아, 이 폴더는 대문자로 시작하는구나"라고 예측 가능해야 함.
2. **도구 호환성 (Compatibility)**: .NET 빌드 시스템은 클래스명과 파일명이 같을 때 가장 잘 작동함.
3. **가독성 (Readability)**: `thisismyfile` 보다는 `ThisIsMyFile`이 훨씬 읽기 쉬움.

## 4. 요약표

| 대상 | 추천 케이스 | 예시 |
| :--- | :--- | :--- |
| 프로젝트/폴더 | PascalCase | `KarmoHub`, `Standards` |
| C# 클래스/파일 | PascalCase | `App.xaml.cs` |
| 일반 문서 (.md) | PascalCase | `NamingConvention.md` |
| 시스템 파일 | kebab-case | `.github`, `package.json` |
