# Feature: KarmoAI General (Spec)

Summary: KarmoAI의 기본적인 LLM 연동 및 구조화된 데이터 추출 기능에 대한 명세.

## 1. 개요 (Overview)

- **목적**: Google Gemini API를 활용한 범용 AI 서비스 레이어 구축.
- **범위**: 텍스트 생성, JSON 데이터 추출, 기본 예외 처리.

## 2. 요구사항 (Requirements)

- **R1**: Gemini 1.5 Flash/Pro 모델 연동 지원.
- **R2**: 시스템 명령(System Instruction)을 통한 페르소나 주입 기능.
- **R3**: 마크다운 태그를 제거하고 순수 JSON만 추출하는 파싱 로직 포함.
- **R4**: API 호출 시 발생할 수 있는 네트워크 및 인증 예외 처리.
- **R5 (Standard)**: API Key 및 모델 설정은 프로젝트 내부 파일(.env 등)이 아닌 **OS 환경 변수** 또는 **User Secrets**를 통해 주입받아야 함.
- **R6 (Robustness)**: 무료 API의 Quota 제한(429)에 대응하기 위해, 실패 시 사전에 정의된 보조 모델로 자동 전환(Fallback)하는 로직을 포함해야 함.

## 3. 설정 방식 (Configuration Standard)

KarmoAI는 보안 및 플랫폼 독립성을 위해 다음 표준을 준수함:

- **Local Development**: .NET `User Secrets`를 사용하여 로컬 머신에 안전하게 보관.
- **Production/CI**: OS 환경 변수(`GEMINI_API_KEY`, `GEMINI_MODEL`)를 직접 참조.
- **Dependency**: 특정 외부 설정 파일 포맷에 의존하지 않음.

### IAIService

- `Task<string> GetResponseAsync(string prompt, string? systemInstruction)`
- `Task<T?> GetStructuredResponseAsync<T>(string prompt, string? systemInstruction)`

## 4. 검증 계획 (Verification Plan)

| ID | 시나리오 | 입력값 | 기대 결과 |
| :--- | :--- | :--- | :--- |
| TC1 | 단순 텍스트 생성 | "안녕?" | 인사말을 포함한 텍스트 응답 |
| TC2 | 구조화된 데이터 추출 | "JSON으로 이름 '철수' 반환해줘" | `{"name": "철수"}` 객체 반환 |
| TC3 | 시스템 명령 테스트 | System: "너는 고양이야", User: "누구니?" | "나는 고양이다냥" 스타일의 응답 |
