# KarmoAI Agent Context

Summary: KarmoAI 구현을 위한 필수 컨텍스트 및 시스템 배경.

## 1. 프로젝트 개요

KarmoAI는 KarmoLab의 모든 프로젝트에서 공유되는 **중앙 집중형 AI 커뮤니케이션 모듈**임.
복잡한 LLM API 호출 로직을 캡슐화하여, 다른 앱들이 비즈니스 로직에만 집중할 수 있게 함.

## 2. 기술 스택 (예정)

- **Language**: C# (.NET 8/9)
- **Main API**: Google Gemini 1.5 Flash / Pro
- **Pattern**: Service/Repository Pattern, Interface-based design

## 3. 우선 순위 작업

1. **Gemini 연동 프로토타입**: API Key 설정 및 기본적인 텍스트 생성 테스트.
2. **구조화된 출력 (Structured Output)**: JSON 스키마를 활용한 데이터 파싱 로직 안정화.
3. **시스템 프롬프트 템플릿**: 각 프로젝트 요구사항에 맞는 시스템 메시지 관리 로직.

## 4. 관련 링크

- **기획 명세**: `Docs/Projects/KarmoAI/Features/General/Spec.md` (예정)
- **상위 규칙**: `Docs/AI/Global/Common_Rules.md`

> **기록 주체**: Alisa (PM)
