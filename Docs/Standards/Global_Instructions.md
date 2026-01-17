# Global Instructions & Guidelines

KarmoLab 리포지토리의 **개발 가이드라인 허브**.
프로젝트별 세부 규칙은 아래 링크된 각 **Convention 문서** 참고 필수.

## 1. 공통 원칙 (General Principles)

### 1.1. 언어 및 태도
- **주 사용 언어**: 문서, 주석, 커밋 메시지 등 모든 소통에 **한국어** 사용. 음슴체 사용 권장.
- **개인정보 보호**: 이 프로젝트는 공개 리포지토리임. 코드나 주석에 하드코딩된 비밀번호, API 키, 개인 식별 정보가 포함되지 않도록 주의

### 1.2. 품질 관리
- **컴파일 점검**: 코드 수정 후에는 반드시 컴파일 에러 유무를 확인(`get_errors` 활용)
- **영향도 파악**: 공용 클래스나 인터페이스 변경 시, 이를 참조하는 다른 프로젝트에 미칠 영향 반드시 미리 점검 필요.

## 2. 프로젝트별 컨벤션 (Project Conventions)

작업하려는 프로젝트에 해당하는 가이드 필독.

### 🏛️ [KarmoHub (WPF)](file:///Docs/Projects/KarmoHub/Convention.md)
- **경로**: `Apps/KarmoHub`
- **핵심**: 프로세스 충돌 방지 빌드 절차, MVVM 패턴

### 🤖 [YawnBot (Discord Bot)](file:///Docs/Projects/YawnBot/Convention.md)
- **경로**: `Apps/YawnBot`
- **핵심**: SOA 아키텍처, DI 패턴, 로깅 및 에러 처리 규칙, 명시적 타입 사용

### 🎮 [Unity (KarmoLab)](file:///Docs/Projects/KarmoToys/Convention.md)
- **경로**: `Unity/KarmoLab`
- **핵심**: Unity 6, UI Toolkit 기반, Partial Class 활용, 네이밍 규칙

### 📝 [Markdown 문서 작성](file:///Docs/Standards/Conventions/Markdown_Convention.md)
- **적용**: 모든 `.md` 파일
- **핵심**: 헤딩 구조, 코드 블록 언어 태그 필수

### 📛 [네이밍 규칙](file:///Docs/Standards/Conventions/Naming_Convention.md)
- **적용**: 폴더, 소스 코드, 문서명
- **핵심**: PascalCase 원칙 (단, 시스템 파일 및 하위 호환성 예외 허용)

## 3. AI 에이전트 작업 절차

1. **컨텍스트 파악**: 작업 전 **[.agent/Architecture_Overview.md](file:///c:/Users/masca/source/repos/_Mascari4615/KarmoLab/.agent/Architecture_Overview.md)** 읽고 폴더 구조 이해.
2. **규칙 준수**: 작업 대상 프로젝트 확인 및 섹션 2 컨벤션 숙지.
3. **안전한 변경**: 기존 코드 스타일 존중 및 불필요한 변경 최소화.
