# KarmoLab Project Context

Summary: KarmoLab 모노레포 프로젝트의 전체 컨텍스트 및 배경 정보.

## 📋 Project Overview

KarmoLab은 개인 프로젝트 모노레포입니다. 다양한 플랫폼과 기술 스택을 활용한 여러 프로젝트를 하나의 저장소에서 관리합니다.

### Repository Structure

```plaintext
KarmoLab/
├── Apps/              # .NET 애플리케이션 및 확장
├── Unity/             # Unity 프로젝트 및 패키지
├── Lab/               # 실험적 프로젝트
├── docs/              # 전역 문서 (가이드, 표준 등)
└── .agent/            # AI 에이전트 워크플로우 및 환경 설정
```

## 🎮 Projects

### YawnBot (Discord Bot)

- **Platform**: .NET 9.0
- **Purpose**: Discord 서버 관리 및 미니게임 (GitHub Webhook 포함)
- **Location**: `Apps/YawnBot/`
- **Features**: Gemini API 통합, 배포 자동화, 경제 시스템

### KarmoToys (Desktop Companion)

- **Platform**: Unity
- **Purpose**: 데스크탑 컴패니언 애플리케이션
- **Location**: `Unity/KarmoLab/Assets/KarmoToys/`
- **Features**: Companion 캐릭터, 타이머/알람 (Unity Assets 내 위치)

### KarmoHub (Project Management)

- **Platform**: WPF (.NET)
- **Purpose**: 개인 프로젝트 통합 런처 및 관리 도구
- **Location**: `Apps/KarmoHub/`
- **Features**: UI 대시보드, 프로젝트 추적, 스팀 스타일 디자인

### KarmoEditor (Unity Extensions)

- **Platform**: Unity Editor
- **Purpose**: Unity 에디터 확장 도구 (Local Package 형태)
- **Location**: `Unity/LocalPackages/com.mascari4615.karmo-editor/`
- **Features**: Scene Toolbar, 커스텀 에디터 툴

### KarmoAI (AI Services)

- **Platform**: .NET
- **Purpose**: AI 통합 서비스 및 로깅
- **Location**: `Apps/KarmoAI/`
- **Features**: Gemini API Fallback 로직, JSON 모드

### KarmoVSC-Ext (VS Code Extension)

- **Platform**: TypeScript/Node.js
- **Purpose**: 개발 생산성 향상을 위한 VS Code 확장
- **Location**: `Apps/karmo-vscode-extension/`
- **Features**: 에이전트 사이드바, 파일 그룹핑

## 🎯 Development Philosophy

### Core Values

1. **실용주의**: 이론보다 실제 동작하는 것 우선
2. **플랫폼 표준 준수**: 각 생태계의 관례 존중
3. **문서화 우선**: 코드만큼 문서도 중요하게 관리
4. **지속적 개선**: 점진적 기능 고도화

### Technical Priorities

- **사용자 경험 (UX)**: 직관적이고 매끄러운 사용성
- **심미성 (Aesthetics)**: 프리미엄 디자인 선호 (Vibrant colors, Dark mode)
- **모듈화**: 독립적이고 재사용 가능한 구조

## 📚 Documentation Structure

### Project-Local Docs

각 프로젝트는 개별 `docs/` 폴더를 통해 상세 기능을 관리함:

```plaintext
<project>/docs/
├── Features/          # 기능별 명세 및 작업 내역
│   └── <feature>/
│       ├── spec.md    # 기획/설계
│       ├── history.md # 변경 이력
│       └── todo.md    # 작업 목록
├── todo.md            # 프로젝트 전체 작업 목록
└── history.md         # 프로젝트 주요 마일스톤
```

## 🔄 Workflow Integration

### AI Agent Workflows

`.agent/workflows/`에 정의된 핵심 자동화 절차:

- **check-compliance**: 문서 및 컨벤션 준수 검증
- **init-feature**: 새 기능 시작 시 표준 문서 구조 생성
- **review-work**: 작업 결과물에 대한 AI 기반 리뷰
- **verify-identity**: 페르소나 및 태도 검증

## 🎨 Design Principles

### UI/UX

- 일관된 시각적 피드백 (Hover effects, Transitions)
- 반응형 UI 레이아웃
- 고품질 타이포그래피 (Inter, Roboto 등)

## 📖 Key Documents

### Standards

- `docs/standards/conventions.md`: 통합 코딩 및 문서 규칙

### Reference & Notes

- `docs/dev/basics.md`: 기본 개발 환경 가이드
- `docs/dev/tech-notes/`: 프로젝트별 기술 이슈 및 해결 노트

## 🚀 Getting Started

### For New Tasks

1. 각 프로젝트의 `docs/todo.md` 확인
2. `/init-feature`로 기능 관리 구조 생성
3. `spec.md` 설계 및 구현 진행
4. `history.md` 업데이트 및 마무리

**Maintained by**: Alisa (PM & Secretary)
