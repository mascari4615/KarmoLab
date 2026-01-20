# 기능 명세서: YawnBot Gemini 연동 및 리팩토링

Summary: YawnBot에 KarmoAI(Gemini) 기능을 추가하고 설정 시스템을 현대화하기 위한 상세 명세서.

## 1. 개요 (Overview)

`KarmoAI` 프로젝트의 Gemini 서비스를 `YawnBot`에 통합하여 지능형 상호작용 및 외부 데이터(뉴스 등) 요약 기능을 제공함. 또한 기존의 `.env` 방식 설정을 .NET 표준 Configuration 시스템으로 전환하여 보안성을 강화함.

## 2. 기능 요구사항 (Functional Requirements)

- **`/yawn` 커맨드**: 사용자의 질문에 대해 Gemini AI가 응답을 생성하여 Discord Embed 형태로 출력함.
- **넥슨 뉴스 요약**: 넥슨 관련 소식을 수집하고 AI를 통해 구조화된 요약본을 생성함.
- **설정 리팩토링**: `dotenv.net` 의존성을 제거하고 User Secrets 및 시스템 환경 변수를 사용하도록 수정함.

## 3. 기술 설계 (Technical Design)

- **대상 프레임워크**: .NET 9.0
- **핵심 의존성**: `Discord.Net`, `KarmoAI` 프로젝트 참조.
- **의존성 주입**: `IAIService`를 `Program.cs`에서 관리함.

## 4. 테스트 케이스 (TC)

| ID | 테스트 항목 | 검증 절차 | 기대 결과 |
|---|---|---|---|
| TC-01 | 설정 로드 검증 | `.env` 파일 없이 User Secrets만으로 봇 실행함. | 봇이 정상적으로 로그인되고 작동함. |
| TC-02 | `/yawn` 응답 확인 | Discord에서 커맨드 실행 및 질문 입력함. | AI의 응답이 Embed 형태로 정상 출력됨. |
| TC-03 | 뉴스 요약 기능 | 뉴스 뉴스 요약 로직을 강제 트리거함. | 구조화된 요약 데이터가 Discord 채널에 보고됨. |
| TC-04 | 규준 준수 확인 | `/check-compliance` 워크플로우 실행함. | 모든 문서가 규준을 통과함. |
