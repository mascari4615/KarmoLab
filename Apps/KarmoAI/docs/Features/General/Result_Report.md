# Result Report: Gemini API Standard Integration & Robust Fallback

Summary: KarmoAI의 LLM 연동 레이어 및 모델 폴백 시스템 구현 결과 보고서.

## 1. 개요

본 작업은 KarmoAI의 LLM 연동 레이어에 안정성과 보안성을 동시에 확보하기 위해 수행됨. 특히 무료 API의 제약인 할당량 제한(Quota)과 모델 가용성 변화에 대응할 수 있는 **자동 모델 폴백(Fallback) 엔진**을 구현함.

## 2. 주요 성과

### 2.1 자동 모델 폴백(Fallback) 및 로테이션

- **지능형 재시도**: 특정 모델이 429(할당량 초과), 404(모델 없음), 또는 타임아웃(30초) 발생 시, 사전에 정의된 우선순위 리스트를 순회하며 자동으로 다음 가용 모델을 호출합니다.
- **가용 모델 리스트**: `gemini-flash-latest`, `gemini-2.0-flash`, `gemini-2.0-flash-lite` 등 최신 가용 모델 정보를 바탕으로 리스트를 구성했습니다.
- **내결함성 확보**: 모든 모델이 실패할 때까지 사용자에게 에러를 노출하지 않고 내부적으로 복구를 시도합니다.

### 2.2 API 키 관리 표준화

- **User Secrets 기반**: 로컬 머신 수준의 비밀 저장소를 사용하여 소스 코드 유출 위험을 원천 차단했습니다.
- **구성 통합**: `ConfigurationBuilder`를 통해 환경 변수와 비밀 설정을 단일 인터페이스로 제공합니다.

### 2.3 GeminiService 고도화

- **System Instruction**: AI의 페르소나와 규칙을 정의하는 고급 설정 기능을 완비했습니다.
- **Robust JSON Paraser**: `UseJsonMode`와 함께 마크다운 블록이 섞인 응답도 완벽하게 추출하는 파서를 적용하여 TC2(JSON) 성공률을 극대화했습니다.

## 3. 최종 검증 결과 (Verification)

`gemini-1.5-flash`에서 의도적으로 404 에러를 유도한 후, `gemini-flash-latest`로 자동 전환되어 성공하는 시나리오를 검증 완료했습니다.

- **TC1 (Simple Message)**: Fallback 작동 후 정상 텍스트 응답 (Pass)
- **TC2 (JSON Extraction)**: 복잡한 로봇 프로필 JSON 파싱 (Pass)
- **TC3 (System Persona)**: 고양이 페르소나('~냥') 적용 (Pass)

## 4. 검토 대상 문서

- [History.md](file:///C:/Users/masca/source/repos/KarmoLab/Docs/Projects/KarmoAI/Features/General/History.md) (최종 결정 이력)
- [Todo.md](file:///C:/Users/masca/source/repos/KarmoLab/Docs/Projects/KarmoAI/Features/General/Todo.md) (작업 완료 현황)
- [GeminiService.cs](file:///C:/Users/masca/source/repos/KarmoLab/Apps/KarmoAI/Services/GeminiService.cs) (폴백 핵심 로직)

> **보고자**: Antigravity
