# KarmoLab Project Standards

Summary: KarmoLab 모노레포 프로젝트의 통합 개발 표준 및 규칙.

## 📋 개요

이 문서는 KarmoLab 프로젝트의 모든 개발 표준을 정의합니다. 일관성 있는 코드베이스 유지를 위해 모든 기여자는 이 표준을 따라야 합니다.

## 🎯 핵심 원칙

1. **플랫폼 표준 우선** - 각 플랫폼/프레임워크의 공식 가이드라인 준수
2. **일관성** - 프로젝트 전체에서 동일한 스타일 유지
3. **가독성** - 명확하고 이해하기 쉬운 코드 작성
4. **문서화** - 모든 주요 기능과 변경사항 문서화

## 📁 프로젝트 구조

### 모노레포 구성

```
KarmoLab/
├── Apps/              # .NET 애플리케이션
│   ├── YawnBot/
│   ├── KarmoHub/
│   └── KarmoAI/
├── Unity/             # Unity 프로젝트
│   ├── KarmoToys/
│   └── KarmoEditor/
├── Lab/               # 실험적 프로젝트
├── Docs/              # 전역 문서
│   ├── AI/            # AI 에이전트 페르소나
│   └── Standards/     # 개발 표준
└── .agent/            # 에이전트 워크플로우
```

### 프로젝트별 구조

각 프로젝트는 다음 구조를 따릅니다:

```
ProjectName/
├── src/               # 소스 코드
├── tests/             # 테스트 코드
├── docs/              # 프로젝트 전용 문서
│   ├── features/      # 기능별 문서
│   ├── history.md     # 변경 이력
│   └── todo.md        # 작업 목록
└── README.md          # 프로젝트 개요
```

## 💻 코딩 표준

### C# (.NET)

- **스타일**: Microsoft C# 코딩 규칙 준수
- **파일/클래스**: PascalCase, 1 파일 = 1 클래스
- **네임스페이스**: 폴더 구조와 일치
- **비동기**: async/await 사용, Task 반환

### Unity (C#)

- **스타일**: Unity 공식 스타일 가이드 준수
- **MonoBehaviour**: PascalCase, 파일명 = 클래스명
- **에셋**: 카테고리_대상_상태 형식
- **씬**: 의미 있는 이름 (MainMenu, GamePlay_Level01)

## 📝 네이밍 규칙

상세 내용은 [naming-convention.md](naming-convention.md) 참조

### 요약

| 항목 | 규칙 | 예시 |
|------|------|------|
| C# 파일/폴더 | PascalCase | UserService.cs, Services/ |
| Unity 파일/폴더 | PascalCase | PlayerController.cs, Scripts/ |
| 문서 폴더 | kebab-case | features/, guides/ |
| 문서 파일 | kebab-case | api-reference.md |
| 표준 문서 | UPPERCASE | README.md |

## 🔄 Git 워크플로우

### 브랜치 전략

- `main`: 프로덕션 브랜치
- `feature/*`: 새 기능 개발
- `fix/*`: 버그 수정
- `docs/*`: 문서 작업

### 커밋 메시지

**Conventional Commits** 형식 사용 (상세: [Commit_Guide.md](Commit_Guide.md))

```
<type>(<scope>): <subject>

<body>

<footer>
```

**예시**:

```
feat(karmo-toys): implement companion animation system

- Add idle, walk, sleep animations
- Integrate with state machine
```

### Type 종류

- `feat`: 새 기능
- `fix`: 버그 수정
- `docs`: 문서
- `refactor`: 리팩토링
- `perf`: 성능 개선
- `test`: 테스트
- `chore`: 빌드/설정

### Scope (프로젝트)

- `karmo-toys`
- `yawn-bot`
- `karmo-hub`
- `karmo-editor`
- `karmo-ai`
- `karmo-lab` (전역)

## 📚 문서화 표준

### 필수 문서

모든 프로젝트는 다음 문서를 포함해야 합니다:

- `README.md`: 프로젝트 개요, 시작 가이드
- `docs/history.md`: 변경 이력
- `docs/todo.md`: 작업 목록

### 기능 문서

새 기능 개발 시 다음 문서 작성:

- `docs/features/<feature-name>/spec.md`: 기능 명세
- `docs/features/<feature-name>/history.md`: 개발 이력
- `docs/features/<feature-name>/todo.md`: 작업 목록

### 마크다운 규칙

- **Summary 필수**: 모든 문서 상단에 `Summary:` 필드 포함
- **헤더 뒤 빈 줄**: 모든 헤더 뒤에는 빈 줄 추가
- **명사형 종결**: 문장은 명사형으로 종결

## 🧪 테스트 표준

### C# 프로젝트

- **프레임워크**: xUnit 또는 NUnit
- **커버리지**: 핵심 로직 80% 이상
- **네이밍**: `MethodName_Scenario_ExpectedResult`

### Unity 프로젝트

- **프레임워크**: Unity Test Framework
- **Play Mode Tests**: 게임플레이 로직
- **Edit Mode Tests**: 유틸리티, 에디터 확장

## 🔍 코드 리뷰 가이드

### 체크리스트

- [ ] 코딩 표준 준수
- [ ] 네이밍 규칙 일관성
- [ ] 적절한 주석 및 문서화
- [ ] 테스트 코드 포함
- [ ] 성능 고려사항 검토
- [ ] 보안 취약점 확인

### 리뷰 원칙

1. **건설적 피드백**: 개선 방향 제시
2. **명확한 근거**: 왜 변경이 필요한지 설명
3. **존중**: 긍정적이고 협력적인 태도

## 🚀 배포 표준

### 버전 관리

**Semantic Versioning** (SemVer) 사용

```
MAJOR.MINOR.PATCH

예: 1.2.3
- MAJOR: 호환성 깨지는 변경
- MINOR: 기능 추가 (하위 호환)
- PATCH: 버그 수정
```

### 릴리스 노트

각 릴리스마다 다음 포함:

- 새 기능 목록
- 버그 수정 목록
- Breaking Changes
- 업그레이드 가이드

## 📖 참고 자료

### 내부 문서

- [Commit Guide](Commit_Guide.md) - Git 커밋 메시지 작성 가이드
- [Naming Convention](naming-convention.md) - 파일/폴더 네이밍 규칙
- [Project Documentation Convention](../Conventions/project-doc-convention.md) - 문서 작성 규칙

### 외부 리소스

- [Microsoft C# Coding Conventions](https://docs.microsoft.com/dotnet/csharp/fundamentals/coding-style/coding-conventions)
- [Unity Style Guide](https://unity.com/how-to/naming-and-code-style-tips-c-scripting-unity)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)

## 🔄 표준 업데이트

이 표준은 프로젝트 진화에 따라 업데이트됩니다. 변경 제안은 다음 절차를 따릅니다:

1. 이슈 생성 (제안 내용 설명)
2. 팀 논의
3. 승인 후 문서 업데이트
4. 변경 사항 공지

---

**마지막 업데이트**: 2026-01-21  
**버전**: 1.0.0
