# KarmoVSC-Ext Agent Context

Summary: KarmoVSC-Ext 프로젝트 작업을 위한 필수 컨텍스트 및 규칙 모음.

> **Target Project**: `Apps/karmo-vscode-extension`
> **Base Persona**: `Docs/AI/Projects/KarmoVSC/Implementer.md`

## 1. ⚠️ 절대 규칙 (Critical Rules)

> **[필독]** 이 컨텍스트는 `Docs/AI/Global/Common_Rules.md`를 상속받음.
> 해당 문서의 **언어(한국어), 안전성(빌드 필수), 스타일 규칙**을 먼저 숙지할 것.

### VSCode-Ext-Specific Rules

1. **빌드**: `npm run compile`을 통해 TypeScript 컴파일 에러 여부를 항상 체크함.
2. **UX**: VS Code 고유의 UI 테마와 사용자 경험을 해치지 않도록 설계함.

## 2. 🛠️ 기술 스택 (Tech Stack)

- **Language**: TypeScript
- **Target**: VS Code Extension (^1.90.0)
- **Tooling**: npm, Webpack/TSC
- **Key Features**: Side Bar Container, Webview View.

## 3. 📂 참고 문서 (Context Links)

- **전역 아키텍처**: `Docs/Standards/Architecture_Overview.md`
- **package.json**: `Apps/karmo-vscode-extension/package.json`
- **소스 경로**: `Apps/karmo-vscode-extension/src/`

## 4. 🚀 시작 가이드 (Start Guide)

1. 이 컨텍스트를 로드했다면, `npm run compile`으로 빌드 상태를 확인하라.
2. VS Code API 문서와 프로젝트 소스를 분석하여 주어진 작업을 수행하라.
