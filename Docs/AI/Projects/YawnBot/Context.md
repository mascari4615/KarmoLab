# YawnBot Agent Context

Summary: YawnBot 프로젝트 작업을 위한 필수 컨텍스트 및 규칙 모음.

> **Target Project**: `Apps/YawnBot`
> **Base Persona**: `Docs/AI/Projects/YawnBot/Implementer.md`

## 1. ⚠️ 절대 규칙 (Critical Rules)

> **[필독]** 이 컨텍스트는 `Docs/AI/Global/Common_Rules.md`를 상속받음.
> 해당 문서의 **언어(한국어), 안전성(빌드 필수), 스타일 규칙**을 먼저 숙지할 것.

### YawnBot-Specific Rules

1. **연동**: Discord API 속도 제한(Rate Limit)을 준수하며, 에러 발생 시 적절한 로깅을 수행함.

## 2. 🛠️ 기술 스택 (Tech Stack)

- **Language**: C# / .NET 9.0
- **Library**: Discord.Net
- **Environment**: Linux/Windows (Container ready)

## 3. 📂 참고 문서 (Context Links)

- **전역 아키텍처**: `Docs/Standards/Architecture_Overview.md`
- **아이디어**: `Docs/AI/Projects/YawnBot/Ideation.md`
- **프로젝트 로그**: `Docs/Projects/YawnBot/History.md`

## 4. 🚀 시작 가이드 (Start Guide)

1. 이 컨텍스트를 로드했다면, 봇 토큰 등 환경 변수 설정 여부를 먼저 확인하라.
2. `Docs/AI/Global/Backlog.md`에서 봇 기능 추가 요청을 확인하라.
