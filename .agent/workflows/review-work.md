---
description: 
---

---
description: 제출된 결과물의 코드 품질 및 문서화 규준 준수 여부를 검토함

1. **대상 프로젝트 확인**
   - 현재 작업 중인 경로 확인.

2. **문서화 규준 검사**
   - `Docs/Projects/[ProjectName]/Features/[FeatureName]/` 하위에 아래 3종 세트가 존재하는지 확인:
     - `Spec.md` (기획/설계 및 **Test Case**)
     - `History.md` (변경 이력)
     - `Todo.md` (남은 작업)
   - `Spec.md` 내에 마스터가 직접 플레이 테스트가 가능한 수준의 **TC**가 포함되어 있는지 확인.
   - 파일 상단에 `Summary:`가 포함되어 있는지 확인.

3. // turbo
   **정적 분석 및 빌드 체크 (PASS 기준)**
   - `dotnet build` (C#의 경우) 실행하여 컴파일 에러가 **0개**인지 반드시 확인.
   - `/check-compliance`를 통해 마크다운 규칙 및 워크플로우 동기화 상태 확인.

4. **기획/구현 일치성 검토 (Consistency Check)**
   - 구현된 코드가 기획서(`Spec.md`)의 요구사항을 모두 충족하는지 대조.
   - API 시그니처, 데이터 구조 등이 설계안과 일치하는지 확인.
   - 만약 구현 과정에서 기획이 바뀌었다면, `Spec.md`도 업데이트되었는지 검토.

5. **코드 리뷰 수행**
   - 인터페이스 설계 의도에 맞게 구현되었는지 확인.
   - 예외 처리 및 환경 설정(보안) 요소 검토.

6. **결과 보고 및 피드백 생성**
   - 위 항목들을 종합하여 Alisa의 관점에서 검토 의견을 메인테이너에게 보고함.
   - **Review_Feedback.md 생성**: `Features/[FeatureName]/Review_Feedback.md`를 생성하여 공식 피드백을 기록함.
     - 검토 상태: PASS / CONDITIONAL PASS / FAIL
     - Critical Issues (반드시 수정)
     - Minor Issues (선택적 수정)
     - Approved Items (승인된 항목)
     - Next Steps (다음 단계)
   - **반려(Reject)**: 필수 문서 누락 또는 빌드 실패 시.
   - **조건부 승인(Conditional Pass)**: 문서화는 완벽하나 코드 수정 필요 시.
   - **승인(Approve)**: 모든 규준 통과 시.
