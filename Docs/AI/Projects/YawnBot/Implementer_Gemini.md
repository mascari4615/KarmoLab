# Implementer Directive: YawnBot Gemini Integration

Summary: YawnBot에 KarmoAI(Gemini)를 연동하기 위한 구현 에이전트 전용 지침서.

## 🎯 미션 (Mission)

마스터의 YawnBot에 KarmoAI 서비스 레이어를 성공적으로 통합하여 지능형 대화 및 뉴스 요약 기능을 활성화함.

## 📚 참조 컨텍스트 (Must Read)

작업 시작 전 다음 문서들을 반드시 숙지할 것:

1. **[Implementation Plan](file:///C:/Users/masca/.gemini/antigravity/brain/784f5ef2-4412-450f-826d-7ba9b95bcc11/implementation_plan.md)**: 연동 상세 계획 및 체크리스트.
2. **[Security & Config Standard](file:///c:/Users/masca/source/repos/KarmoLab/Docs/Standards/Conventions/Security_Config_Convention.md)**: .env 사용 금지, User Secrets 및 환경 변수 활용 지침.
3. **[Project Doc Convention](file:///c:/Users/masca/source/repos/KarmoLab/Docs/Standards/Conventions/Project_Doc_Convention.md)**: Spec, History, Todo, 그리고 **Result_Report** 작성 규칙.

## 🛠️ 기술적 핵심 지시 (Technical Directives)

### 1. 의존성 주입 (Dependency Injection)

- `Apps/KarmoAI` 프로젝트를 참조에 추가함.
- `Program.cs`에서 `WebApplicationBuilder`를 통해 `IAIService` (GeminiService)를 싱글톤 또는 범위(Scoped) 서비스로 등록함.

### 2. 설정 관리 (Configuration)

- `dotenv.net` 관련 로직을 모두 제거함.
- `.NET Configuration` 시스템을 사용하여 `GEMINI_API_KEY` 등을 주입받도록 `Program.cs`를 리팩토링함.

### 3. 기능 구현

- `Modules/GeminiModule.cs`를 생성하여 `/yawn` 슬래시 커맨드를 구현함.
- `NexonNewsService`를 통해 뉴스 데이터를 가져오고, KarmoAI의 `GetStructuredResponseAsync`를 활용하여 요약 JSON을 추출함.

## 📝 작업 산출물 (Definition of Done)

작업 완료 시 다음 문서들이 반드시 제출되어야 함:

- **`Spec.md`**: 구현된 기능의 상세 명세 및 플레이 테스트 TC.
- **`History.md`**: 구현 과정 및 결정 사항 기록.
- **`Todo.md`**: 잔여 작업 업데이트.
- **`Result_Report.md`**: **(필수)** 최종 구현 요약 및 테스트 결과 보고.

---
> **발령자**: Alisa (PM)  
> **날짜**: 2026-01-20
