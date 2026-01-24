---
description: 새로운 피처의 표준 문서 구조(Spec, History, Todo)를 자동으로 생성함
---

# 🚀 모노레포 통합 TDD 마스터 워크플로우 (Unity/Standard 분기형)

이 워크플로우는 [프로젝트명]과 [피처명]이 확정된 후, 작업 시작부터 완료 보고까지의 표준 절차를 정의함. 모든 에이전트는 이를 엄격히 준수함.

## 1. 초기 분석 및 문서화

1. **마스터 확인**: 마스터로부터 `[프로젝트명]`과 `[피처명]`을 확인받음.
2. **기술 스택 판별**: 해당 프로젝트 폴더를 분석하여 기술 스택을 판별함. (Unity, Standard C#, Node.js 등)
3. **디렉터리 생성**: `Docs/Projects/[프로젝트명]/Features/[피처명]` 경로를 생성함.
4. **표준 문서 생성** (`conventions.md` 준수):
   - `Spec.md`: 기능 명세와 함께 **[검증 기준(Test Cases)]** 섹션을 반드시 포함함.
   - `History.md`: 초기 생성 기록 및 TDD 워크플로우 시작을 기록함.
   - `Todo.md`: 기능 구현 및 **[테스트 통과 여부]** 체크리스트를 구성함.

## 2. 테스트 환경 구축 (Branching)

기술 스택에 따라 아래 절차를 수행함.

- **CASE A: Unity Project**
  - `Tests/[피처명]` 폴더 생성 및 `asmdef` 파일 설정 (메인 코드 참조 확인).
  - Unity Test Framework 설치 여부 확인.
- **CASE B: Standard C# Project**
  - 프로젝트 내 유닛 테스트 프로젝트(NUnit/xUnit) 존재 여부 확인 및 생성.
- **ELSE**
  - 생략.

## 3. TDD 워크플로우 실행 (Red-Green-Refactor)

1. **Red Stage (실패하는 테스트)**:
   - `Spec.md`의 검증 기준을 기반으로 실패하는 테스트 코드를 먼저 작성함.
   - 아래 CLI 명령어로 테스트가 **Fail**됨을 확인하고 로그를 기록함.
     - Unity: `Unity.exe -batchmode -nographics -projectPath [경로] -runTests -testPlatform EditMode`
     - C#: `dotnet test`
2. **Green Stage (최소 기능 구현)**:
   - 테스트를 통과하기 위한 최소한의 코드를 작성함.
   - CLI 테스트를 반복 실행하여 **Pass**가 뜰 때까지 수정함.
3. **Refactor Stage (코드 최적화)**:
   - 테스트 통과 상태를 유지하며 코드를 리팩토링함.
   - **빌드 검증 (필수)**: 리팩토링 후에도 반드시 CLI(`dotnet build` 등)를 통해 컴파일 에러가 없음을 확인하여 '수정 후 빌드' 원칙을 고수함.

## 4. 완료 및 보고

1. **링크 업데이트**: 프로젝트 루트의 `README.md` 또는 `History.md`에 해당 피처 폴더를 링크함.
2. **최종 보고**: 마스터에게 `Spec.md` 검토를 요청하며 다음 내용을 포함함.
   - 판별된 기술 스택.
   - CLI 테스트 최종 Pass 결과 로그.
   - 작업 중 발생한 특이사항.
