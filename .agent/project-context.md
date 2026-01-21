# KarmoLab Project Context

Summary: KarmoLab 모노레포 프로젝트의 전체 컨텍스트 및 배경 정보.

## 📋 Project Overview

KarmoLab은 개인 프로젝트 모노레포입니다. 다양한 플랫폼과 기술 스택을 활용한 여러 프로젝트를 하나의 저장소에서 관리합니다.

### Repository Structure

```plaintext
KarmoLab/
├── Apps/              # .NET 애플리케이션
├── Unity/             # Unity 프로젝트
├── Lab/               # 실험적 프로젝트
├── Docs/              # 전역 문서
└── .agent/            # AI 에이전트 워크플로우
```

## 🎮 Projects

### YawnBot (Discord Bot)

- **Platform**: .NET 9.0
- **Purpose**: Discord 서버 관리 및 미니게임
- **Location**: `Apps/YawnBot/`
- **Features**: 슬래시 커맨드, Gemini API 통합, 강화/배틀 시스템

### KarmoToys (Desktop Companion)

- **Platform**: Unity
- **Purpose**: 데스크탑 컴패니언 애플리케이션
- **Location**: `Unity/KarmoLab/Assets/KarmoToys/`
- **Features**: Companion 캐릭터, 타이머/알람, 프로젝트 관리

### KarmoHub (Project Management)

- **Platform**: WPF (.NET)
- **Purpose**: 개인 프로젝트 관리 도구
- **Location**: `Apps/KarmoHub/`
- **Features**: UI 대시보드, 프로젝트 추적

### KarmoEditor (Unity Extensions)

- **Platform**: Unity Editor
- **Purpose**: Unity 에디터 확장 도구
- **Location**: `Unity/LocalPackages/com.mascari4615.karmo-editor/`
- **Features**: Scene Toolbar, 커스텀 에디터 도구

### KarmoAI (AI Services)

- **Platform**: .NET
- **Purpose**: AI 통합 서비스
- **Location**: `Apps/KarmoAI/`
- **Features**: AI 에이전트 통합, 자동화

### KarmoVSC-Ext (VS Code Extension)

- **Platform**: TypeScript/Node.js
- **Purpose**: VS Code 확장 프로그램
- **Location**: `Apps/karmo-vscode-extension/`
- **Features**: 개발 생산성 도구

## 🎯 Development Philosophy

### Core Values

1. **실용주의**: 이론보다 실제 동작하는 것 우선
2. **플랫폼 표준 준수**: 각 생태계의 관례 존중
3. **문서화 우선**: 코드만큼 문서도 중요
4. **지속적 개선**: 완벽보다 점진적 발전

### Technical Priorities

- **사용자 경험 (UX)**: 모든 기능의 최우선 고려사항
- **심미성 (Aesthetics)**: 보기 좋은 것이 사용하기도 좋음
- **확장성**: 미래의 변화를 고려한 설계
- **모듈화**: 독립적이고 재사용 가능한 컴포넌트

## 📚 Documentation Structure

### Project-Local Docs

각 프로젝트는 자체 `docs/` 폴더 보유:

```plaintext
<project>/docs/
├── features/          # 기능별 문서
│   └── <feature>/
│       ├── spec.md
│       ├── history.md
│       └── todo.md
├── history.md         # 프로젝트 전체 이력
└── todo.md            # 작업 목록
```

## 🔄 Workflow Integration

### AI Agent Workflows

`.agent/workflows/`에 정의된 워크플로우:

- **check-compliance**: 문서 규칙 검증
- **init-feature**: 기능 문서 구조 생성
- **review-work**: 코드 리뷰 체크리스트
- **verify-identity**: 컨텍스트 검증

### Development Workflow

1. 기능 기획 → `spec.md` 작성
2. 구현 → 코드 작성 + 테스트
3. 문서화 → `history.md` 업데이트
4. 리뷰 → 컴플라이언스 체크
5. 배포 → 릴리스 노트 작성

## 🎨 Design Principles

### UI/UX

- 직관적인 인터페이스
- 일관된 디자인 언어
- 접근성 고려
- 반응형 레이아웃

### Code Architecture

- SOLID 원칙 준수
- Dependency Injection 활용
- 테스트 가능한 구조
- 명확한 책임 분리

## 📖 Key Documents

### Standards

- `Docs/Standards/karmolab-standards.md`: 통합 표준
- `Docs/Standards/guides/commit-guide.md`: 커밋 가이드
- `Docs/Standards/guides/naming-convention.md`: 네이밍 규칙

### Project Management

- `Docs/AI/Global/backlog.md`: 통합 백로그
- `Docs/AI/Global/common-rules.md`: 공통 규칙

### Conventions

- `Docs/Standards/Conventions/project-doc-convention.md`: 문서 규칙
- `Docs/Standards/Conventions/markdown-convention.md`: 마크다운 규칙

## 🚀 Getting Started

### For New Features

1. `/init-feature` 워크플로우 실행
2. `spec.md`에 기능 명세 작성
3. 구현 시작
4. `history.md`에 진행 상황 기록

### For Code Review

1. `/review-work` 워크플로우 실행
2. 체크리스트 확인
3. 필요 시 수정
4. `/check-compliance`로 최종 검증

### For Documentation

1. 모든 문서에 `Summary:` 필드 포함
2. 헤더 뒤 빈 줄 추가
3. 명사형 종결 사용
4. kebab-case 파일명 사용

## 💡 Best Practices

### Code

- 의미 있는 변수/함수명
- 적절한 주석 (Why, not What)
- 테스트 코드 작성
- 성능 고려

### Documentation

- 간결하고 명확하게
- 예시 코드 포함
- 최신 상태 유지
- 링크 검증

### Collaboration

- Conventional Commits 사용
- 작은 단위로 자주 커밋
- 의미 있는 PR 설명
- 코드 리뷰 적극 참여

**Maintained by**: Alisa (PM & Secretary)  
