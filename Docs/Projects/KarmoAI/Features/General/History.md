# Feature: KarmoAI General (History)

Summary: KarmoAI General 기능의 구현 및 변경 이력 기록.

## 2026-01-19: 초기 프로토타입 구현

- **내용**: `GeminiService` 클래스 및 기초 인터페이스 구축.
- **상세**:
  - `Mscc.GenerativeAI` 라이브러리를 이용한 Gemini API 연동.
  - `GetStructuredResponseAsync`를 통한 기본적인 JSON 파싱 로직 추가.
- **결정 사항**: 초기 버전에서는 `ResponseMimeType` 설정 대신 프롬프트 엔지니어링과 정규식/문자열 처리를 통한 JSON 추출 방식을 사용함.

## 2026-01-20: 디버깅 및 리팩토링

- [x] API 키 관리 방식 개선: `.env` 제거 및 `User Secrets` / `Environment Variables` 도입
- [x] Gemini API 404 오류 해결: 가용 모델 목록 확인 및 `gemini-flash-latest` 적용
- [x] `GeminiService` 고도화: `SystemInstruction` 및 `UseJsonMode` 지원 추가
- [x] 테스트 프로젝트 리팩토링: `ConfigurationBuilder` 도입 및 TC1/TC2/TC3 검증 완료
- [x] 모델 자동 폴백(Fallback) 로직 도입 (30초 타임아웃 및 가용 모델 로테이션 구현 완료)

> **기록 주체**: KarmoAI
