# 🤖 Phase 1: 데이터 통합 구현 지시서 (For Implementation Agent)

이 문서는 '통합 프로젝트 매니저' 구축의 첫 단계인 **데이터 통합** 작업을 다른 구현 에이전트에게 요청하기 위한 상세 가이드임.

## 1. 배경 및 맥락 (Context)

- **현재 문제**: 퀘스트보드(`QuestData`)와 비밀노트(`NoteData`)가 개별 데이터 모델과 파일로 분리되어 있어 통합적인 관리가 어려움.
- **최종 목표**: JIRA/GitHub Projects 스타일의 통합 관리 시스템 구축. 이를 위해 **"One Data, Multi-View" (타임라인, 화이트보드, 칸반, 테이블)** 전략을 취함.
- **이번 작업의 의의**: 모든 뷰가 공유할 단일 데이터 소스(Single Source of Truth)를 구축하여 시스템 확장의 기반을 마련함.

## 2. 상세 요구사항 (Requirements)

### 🧩 [NEW] `ProjectItemData.cs` 생성

- 위치: `KarmoToys.Common.Data` 네임스페이스
- 기존 `TodoItem`과 `SecretNote`의 필드를 통합하고 아래 필드를 필수로 포함:
  - `string Id`, `string Title`, `string Content`
  - `MemoType Type` (Task, Concept, Secret 등)
  - `MemoStatus Status` (Todo, Doing, Done, Archive)
  - `Priority Priority` (Low, Medium, High, Critical)
  - `long StartDateTicks`, `long EndDateTicks` (시간 관리용)
  - `Vector2 Position`, `float Angle` (화이트보드 시각화용)

### 🔄 마이그레이션 로직 작성

- `KarmoToysData.cs` 내부에 기존 데이터를 새 모델로 변환하는 함수 구현.
- 기존 데이터를 잃지 않고 안전하게 `List<ProjectItemData>`로 이전해야 함.

### 💾 데이터 서비스 업데이트

- `DataService.cs`에서 새로운 통합 데이터를 저장하고 로드할 수 있도록 수정.

## 3. 구현 에이전트에게 전달할 프롬프트 (Copy & Paste)

> **[작업 요청: 유니티 프로젝트 데이터 통합 Phase 1]**
>
> 안녕! 너는 지금부터 내 유니티 프로젝트의 '통합 프로젝트 매니저' 구축을 위한 **Phase 1: 데이터 통합** 작업을 수행해줘.
>
> **배경:** 현재 `QuestData`와 `NoteData`로 나뉜 시스템을 JIRA 스타일로 통합하려고 해. 그 첫 단계로 데이터 모델을 하나로 합쳐야 해.
>
> **수행할 작업:**
>
> 1. `KarmoToys.Common.Data`에 통합 모델인 `ProjectItemData` 클래스를 만들어줘. (상세 필드는 `Project_Management_System_Spec.md` 참고)
> 2. 기존 데이터를 새 모델로 옮기는 마이그레이션 로직을 작성해줘.
> 3. `DataService`가 이 통합 데이터를 관리하도록 업데이트해줘.
>
> **주의사항:** 기존 사용자의 데이터가 유실되지 않도록 마이그레이션 시 꼼꼼하게 처리해줘. 직접적인 코드 수정 후에는 반드시 컴파일 체킹을 해줘.
>
> 상세 설계는 [.agent/brain/.../project_manager_spec.md](file:///C:/Users/masca/.gemini/antigravity/brain/73ba95e3-ef3e-4b1b-a63e-da468d67d0c9/project_manager_spec.md)를 참고해!

---

## 💡 사용자가 해야 할 일 & 제안

1. **검토 및 승인**: 위 지시서 내용이 의도와 맞는지 확인 후 다른 에이전트에게 전달.
2. **아이콘/에셋 준비**: 화이트보드나 타임라인 뷰에서 사용할 포스트잇 텍스처나 아이콘 리소스가 필요할 수 있음.
3. **카테고리 확정**: `MemoType`이나 `Priority` 항목에 본인이 꼭 필요한 분류가 있다면 미리 알려줘! (예: '아이디어', '질문', '긴급' 등)
