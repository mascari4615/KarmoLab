---
description: 프로젝트 내의 '숨겨진 폭탄'과 '죽은 코드'를 소탕하고 컨벤션(마크다운/코드) 준수 여부를 통합 점검함
---

// turbo

1. **대상 범위 설정**
   - 현재 작업 중인 피처 또는 프로젝트 전역(`Assets/KarmoToys`, `Apps/` 등)을 대상으로 함.

2. **숨겨진 폭탄 (Hidden Bombs) 수색 및 제거**
   - **UI Toolkit**:
     - 모든 UXML 파일에서 개별 `<Style>` 태그 제거 (`MainTheme.tss` 통합 원칙).
     - 모든 USS 파일에서 `.otf`, `.ttf` 등 원본 폰트 직접 참조 제거.
     - 폰트 설정이 필요한 경우 반드시 SDF Font Asset(`.asset`) 사용 여부 확인.
   - **TSS 관리**:
     - `MainTheme.tss` 내의 임포트 경로가 절대 경로(`project://database/`)인지 확인.

3. **죽은 코드 (Dead Code) 소탕**
   - **C# 스크립트**:
     - 사용되지 않는 `private` 필드, 메서드, 프로퍼티 제거.
     - 사용되지 않는 `using` 문 및 네임스페이스 정리.
     - 대규모 주석 처리된 코드 뭉치 제거 (Git History 활용).
   - **USS/UXML**:
     - 정의되었으나 사용되지 않는 스타일 클래스(`.class`) 검색 및 제거.
     - 더 이상 사용되지 않는 템플릿 참조 및 변수 정리.

4. **컨벤션 준수 여부 및 빌드 검증 (Legacy check-compliance 통합)**
   - **정적 분석**:
     - `powershell -ExecutionPolicy Bypass -File .agent/tools/check-markdown-compliance.ps1` 커맨드 실행.
     - 모든 문서가 '음슴체' 및 '명사형 종결'을 유지하는지 수동 재확인.
   - **빌드 검증 (필수)**:
     - `dotnet build` 또는 관련 CLI 명령어를 실행하여 작업 결과물이 컴파일 에러를 유발하지 않는지 최종 확인.

5. **워크플로우 정합성 체크 (Persona Requirement)**
   - **중요**: `conventions.md` 등 프로젝트 표준이 수정되었을 경우, 반드시 이 워크플로우를 포함한 `.agent/workflows/` 내의 모든 파일을 즉시 동기화 수정함.

6. **최종 보고**
   - 소탕 및 교정 내역을 요약하여 마스터에게 보고함.
   - 발견된 새로운 유형의 폭탄이나 레거시 패턴을 `conventions.md`에 추가 건의.
