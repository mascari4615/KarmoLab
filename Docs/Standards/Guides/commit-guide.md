# Conventional Commits Guide

Summary: KarmoLab 프로젝트의 Git 커밋 메시지 작성 가이드. Conventional Commits 형식 기반.

## 📚 기본 형식

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 종류

- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `docs`: 문서만 변경
- `style`: 코드 포맷팅 (세미콜론, 공백 등)
- `refactor`: 리팩토링 (기능 변경 없음)
- `perf`: 성능 개선
- `test`: 테스트 추가/수정
- `chore`: 빌드, 설정 파일 수정
- `ci`: CI/CD 설정 변경

### Scope (KarmoLab)

- `karmo-toys`
- `yawn-bot`
- `karmo-hub`
- `karmo-editor`
- `karmo-ai`
- `karmo-vsc-ext`
- `karmo-lab` (전역)

### Breaking Change 표시

```
feat!: major API change
# 또는
feat(api)!: change authentication method

BREAKING CHANGE: Auth now requires OAuth2
```

## 💡 실전 예시

### 기능 추가

```bash
feat(karmo-toys): implement companion animation system

- Add idle, walk, sleep animations
- Integrate with state machine
- Support smooth transitions between states
```

### 버그 수정

```bash
fix(yawn-bot): resolve gemini api timeout issue

- Increase timeout from 10s to 30s
- Add retry logic with exponential backoff
- Log detailed error messages for debugging
```

### 리팩토링

```bash
refactor(karmo-toys): extract companion modules to separate files

- Split CompanionFeature.cs into modular architecture
- Create InteractionModule, ChatModule, TimeModule
- Improve code maintainability and testability
```

### 문서 작업

```bash
docs(karmo-lab): add alisa persona documentation

- Define PM & Secretary role
- Document service menu and workflows
- Add context and rules for AI agents
```

### 성능 개선

```bash
perf(karmo-toys): optimize companion rendering

- Reduce draw calls by 40%
- Implement sprite batching
- Cache frequently accessed components
```

## 🎓 작성 팁

### 1. Subject (제목)

- **50자 이내**
- **명령형 동사** 사용 (add, fix, update, remove)
- **소문자**로 시작
- **마침표 없음**

### 2. Body (본문)

- **72자마다 줄바꿈**
- **무엇을, 왜** 변경했는지 설명
- **어떻게**는 코드가 설명 (필요시만 작성)

### 3. Footer (꼬리말)

- **Breaking Change** 명시
- **이슈 번호** 참조 (Closes #123)

## 🚀 빠른 참조 카드

```bash
# 새 기능
feat(scope): add new feature

# 버그 수정
fix(scope): resolve specific bug

# 문서
docs(scope): update documentation

# 리팩토링
refactor(scope): restructure code

# 성능
perf(scope): improve performance

# Breaking Change
feat(scope)!: major change
BREAKING CHANGE: details
```

## 📝 VS Code 통합 (선택사항)

`.gitmessage` 파일 생성:

```
# <type>(<scope>): <subject>
# |<----  50 chars  ---->|

# <body>
# |<----  72 chars  ---->|

# <footer>
# BREAKING CHANGE:
# Closes #

# Type: feat, fix, docs, style, refactor, perf, test, chore
# Scope: karmo-toys, yawn-bot, karmo-hub, etc.
```

설정:

```bash
git config commit.template .gitmessage
```

## 💡 핵심 원칙

**간결하게, 명확하게, 일관되게!**
