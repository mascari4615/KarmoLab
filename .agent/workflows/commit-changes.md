---
description: 변경사항을 주제별로 분류하여 체계적으로 커밋함
---

# 커밋 워크플로우

이 워크플로우는 변경사항을 주제별로 분류하여 체계적으로 커밋하는 과정을 안내함.

## 1단계: 문서 업데이트 확인

커밋 전 반드시 관련 문서가 업데이트되었는지 확인:

- `History.md`: 주요 변경사항 기록 확인
- `Todo.md`: 완료된 작업 체크 확인
- Feature 문서 (`Spec.md`, `History.md`): 기능 변경 시 업데이트 확인

**문서가 업데이트되지 않았다면:**

- 커밋 워크플로우 중단
- 문서 먼저 업데이트하고 사용자 확인 받음
- 확인 후 커밋 진행

## 2단계: 변경사항 분석

```powershell
# 전체 변경사항 확인
git status

# renamed 파일 감지를 위해 모든 파일 스테이징
git add -A

# renamed 파일 목록 확인
git status --porcelain=v1 -M | Select-String "^R"

# 전체 변경사항 요약
git diff --cached --stat
```

**변경사항 분류 기준:**

- **파일 이동 (renamed)**: 별도 커밋으로 분리
- **기능 추가**: feat 타입으로 커밋
- **버그 수정**: fix 타입으로 커밋
- **리팩토링**: refactor 타입으로 커밋
- **문서**: docs 타입으로 커밋
- **기타**: chore 타입으로 커밋

## 3단계: 커밋 크기 체크

변경된 파일 수가 **20개 이상**이면 주제별로 분할 권장:

- 파일 이동만 먼저 커밋
- 기능별로 커밋 분리
- 문서는 마지막에 커밋

## 4단계: 주제별 커밋 실행

### 커밋 순서 (권장)

1. **파일 이동 커밋** (있는 경우)

   ```powershell
   git reset
   git add [이동된 파일들]
   git commit -m "refactor(scope): move files to new locations
   
   - 파일A를 경로1 → 경로2로 이동
   - 파일B를 경로3 → 경로4로 이동"
   ```

2. **스타일/구조 개선 커밋**

   ```powershell
   git add [스타일 관련 파일들]
   git commit -m "refactor(scope): improve styling system
   
   - TSS 테마 시스템 통합
   - 인라인 스타일 제거"
   ```

3. **기능 추가/변경 커밋**

   ```powershell
   git add [기능 관련 파일들]
   git commit -m "feat(scope): add new feature
   
   - 기능 A 추가
   - 기능 B 개선
   - 관련 UI 업데이트"
   ```

4. **버그 수정 커밋**

   ```powershell
   git add [버그 수정 파일들]
   git commit -m "fix(scope): fix critical bugs
   
   - 버그 A 수정
   - 버그 B 해결"
   ```

5. **문서 업데이트 커밋** (마지막)

   ```powershell
   git add [문서 파일들]
   git commit -m "docs(scope): update documentation
   
   - History.md 업데이트
   - 기술 가이드 추가
   - API 문서 개선"
   ```

## 5단계: 커밋 메시지 작성 규칙

### 기본 형식

```text
<type>(<scope>): <subject>

<body>
```

### Type

- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `refactor`: 코드 리팩토링 (기능 변경 없음)
- `docs`: 문서 변경
- `style`: 코드 포맷팅, 세미콜론 누락 등
- `test`: 테스트 코드 추가/수정
- `chore`: 빌드 프로세스, 도구 설정 등

### Scope

- `karmo-toys`: KarmoToys 프로젝트
- `karmo-lab`: 전체 모노레포
- `yawn-bot`: YawnBot 프로젝트
- 또는 구체적인 기능명 (예: `dashboard`, `whiteboard`)

### Subject

- 50자 이내
- 명령형 현재 시제 사용
- 첫 글자 소문자
- 마침표 없음

### Body

- 변경사항을 bullet point로 나열
- 파일 이동은 "A → B" 형식으로 명시
- 왜 변경했는지 설명 (무엇을 변경했는지는 코드에서 확인 가능)

### 예시

```text
feat(karmo-toys): integrate whiteboard into project manager

- Whiteboard를 독립 탭에서 ProjectManager의 서브 탭으로 통합
  - MainView에서 TabWhiteboard 버튼 제거
  - ProjectManagerView에 WhiteboardWrapper 추가
  - WhiteboardFeature의 TabButtonName을 null로 설정
- 렌더링 버그 수정
  - WhiteboardView의 display:none 제거
```

## 6단계: 커밋 전 최종 확인

```powershell
# 커밋 내용 확인
git diff --cached

# 커밋 메시지 확인
git log -1

# 문제가 있으면 수정
git commit --amend
```

## 7단계: 푸시 (사용자 승인 필수)

> [!IMPORTANT]
> 원격 저장소로의 푸시는 반드시 사용자의 명시적인 승인이 있을 때만 실행함.

```powershell
# 사용자의 승인을 받은 후 실행
git push origin main
```

## 자동화 팁

### renamed 파일 자동 감지

항상 `git add -A`를 사용하여 Git이 파일 이동을 자동으로 감지하도록 함.

### 커밋 메시지 템플릿 생성

변경된 파일을 분석하여 커밋 메시지 초안을 자동 생성:

```powershell
# 변경된 파일 목록
git diff --cached --name-only

# 주제별로 그룹화하여 커밋 메시지 초안 작성
```

## 주의사항

1. **절대 하지 말 것:**
   - 모든 변경사항을 한 번에 커밋
   - 문서 업데이트 없이 기능 변경 커밋
   - 의미 없는 커밋 메시지 (예: "update", "fix")

2. **반드시 할 것:**
   - 문서 먼저 업데이트
   - 주제별로 커밋 분리
   - Conventional Commits 준수
   - renamed 파일은 명시적으로 표시

3. **커밋 크기:**
   - 한 커밋은 하나의 논리적 변경사항만 포함
   - 너무 크면 분할, 너무 작으면 병합 고려
