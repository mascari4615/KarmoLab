# KarmoLab Conventions (통합 규칙)

Summary: KarmoLab 프로젝트의 모든 컨벤션과 표준을 통합한 종합 가이드.

## 🏗️ 아키텍처 개요

### 전체 시스템 구조

KarmoLab은 사용자의 로컬 환경에서 구동되는 앱들과 Unity 기반의 게임 콘텐츠, 그리고 이를 서포트하는 자동화 도구들로 구성됨.

#### 주요 프로젝트

1. **KarmoHub** (C# / WPF) - 모든 앱과 콘텐츠의 진입점
2. **KarmoToys** (Unity) - 메인 게임 콘텐츠
3. **KarmoEditor** (Unity Editor) - 콘텐츠 에디팅 도구
4. **YawnBot** (Discord) - 커뮤니티 및 프로젝트 알림 봇

### 모노레포 구조

```plaintext
KarmoLab/
├── Apps/              # .NET 애플리케이션
├── Unity/             # Unity 프로젝트
├── Lab/               # 실험적 프로젝트
├── docs/              # 전역 문서
└── .agent/            # AI 에이전트 전용
```

---

## 🎯 핵심 원칙

1. **플랫폼 표준 우선** - 각 플랫폼/프레임워크의 공식 가이드라인 준수
2. **일관성** - 프로젝트 전체에서 동일한 스타일 유지
3. **가독성** - 명확하고 이해하기 쉬운 코드 작성
4. **문서화** - 모든 주요 기능과 변경사항 문서화

---

## 📝 Markdown 작성 규칙

### 문서 구조

- **문서 제목(H1)**: 파일 최상단에 하나만
- **Summary**: 제목 다음 줄에 문서 목적 한 줄 요약

### 포맷팅

- GitHub Flavored Markdown 준수
- 헤딩 뒤 반드시 빈 줄 삽입
- 코드 블록 언어 태그 필수 (```csharp,```bash, ```json)
- 들여쓰기 일관성 유지
- 테이블 파이프 양쪽에 공백 추가 (MD060)
- **중복 헤더 금지 (MD024)**: 동일 문서 내에 완전히 일치하는 헤더 텍스트 사용 금지 (내부 앵커 링크 충돌 방지)
- **고유성 확보**: `개념`, `특징` 등 범용적 단어는 `UXML 개념`, `UXML 특징`과 같이 상위 맥락을 포함하여 고유하게 명명함

### 🎨 스타일 및 폰트 안전 규칙 (Hidden Bombs 방지)

- **TSS 단일 관리**: `MainTheme.tss`를 사용하는 프로젝트에서는 개별 UXML 파일 내에서 `<Style>` 태그 사용을 금지함. 모든 스타일 임포트는 TSS에서 절대 경로(`project://database/`)로 관리함.
- **원본 폰트 직접 참조 금지**: USS 파일 내에서 `.otf`, `.ttf` 등 원본 폰트 파일을 직접 `--unity-font` 등에 할당하는 것을 엄격히 금지함. (멀티스레드 렌더링 엔진 NRE 유발 방지)
- **SDF 에셋 전용**: 폰트 적용 시 반드시 TextMeshPro를 통해 생성된 `.asset`(SDF Font Asset)만을 사용하며, 가급적 `UITK Text Settings` 전역 설정을 통해 적용함.
- **죽은 코드 제거**: 사용하지 않는 테마 변수나 템플릿 참조는 발견 즉시 제거하여 로딩 최적화를 유지함.

### 언어 및 스타일

- 기본 언어: 한국어
- 어조: 간결하고 명확, 음슴체 권장
- 시간 표기: KST 기준

---

## 🔤 Naming Convention (네이밍 규칙)

### 플랫폼별 표준

| 대상 | 규칙 | 예시 |
| --- | --- | --- |
| **문서 (docs/)** | kebab-case | `naming-convention.md` |
| **C# 코드** | PascalCase | `MainWindow.cs` |
| **Unity 에셋** | PascalCase | `PlayerController.cs` |
| **Node.js** | kebab-case | `package.json` |
| **표준 문서** | kebab-case | `history.md`, `todo.md` |
| **최상위 요약** | UPPERCASE | `README.md` |

### 원칙

- **일관성**: 같은 플랫폼 내에서 일관된 규칙
- **플랫폼 표준 우선**: 각 생태계의 관습 존중
- **가독성**: `ThisIsMyFile` > `thisismyfile`

---

## 📚 프로젝트 문서화 규칙

### 필수 문서 (프로젝트 루트)

- `README.md`: 프로젝트 개요, 빌드 가이드
- `history.md`: 주요 마일스톤 및 릴리스 내역
- `todo.md`: 현재 작업 및 계획

### 피처 단위 관리 (Features/)

각 피처는 독립 폴더로 관리:

- `spec.md`: 기능 명세 및 기획
- `history.md`: 변경 이력
- `todo.md`: 작업 목록
- `result-report.md`: 작업 완료 보고
- `review-feedback.md`: PM 리뷰 결과

### 작성 규칙

- 명사형 종결 (`~함`, `~임`)
- Summary 필수
- 관련 문서 적극 링크

---

## 💻 코딩 표준

### C# (.NET)

- **스타일**: Microsoft C# 코딩 규칙 준수
- **파일/클래스**: PascalCase, 1 파일 = 1 클래스
- **네임스페이스**: 폴더 구조와 일치
- **비동기**: async/await 사용, Task 반환
- **명시적 선언**: `var` 대신 명시적인 타입을 사용함 (가독성 및 타입 안정성 확보)

### 🗑️ 죽은 코드 및 레거시 제거 규칙 (Dead Code Elimination)

- **Unused Members**: 사용되지 않는 private 필드, 메서드, 프로퍼티는 발견 즉시 제거함. IDE의 '회색조' 경고를 무시하지 않음.
- **Commented-out Logic**: 나중에 쓸 것 같은 주석 처리된 코드 뭉치는 가급적 제거하고 Git History에 의존함.
- **Redundant Namespaces**: 사용하지 않는 `using` 문은 정리함.
- **Obsolete Data**: 데이터 구조 변경 시 예전 필드는 `[Obsolete]` 처리 후 안정화 단계에서 반드시 삭제함.

### Unity (C#)

- **스타일**: Unity 공식 스타일 가이드 준수
- **MonoBehaviour**: PascalCase, 파일명 = 클래스명
- **에셋**: 카테고리_대상_상태 형식
- **씬**: 의미 있는 이름 (MainMenu, GamePlay_Level01)

---

## 🔄 Git 워크플로우

### 브랜치 전략

- `main`: 프로덕션 브랜치
- `feature/*`: 새 기능 개발
- `fix/*`: 버그 수정
- `docs/*`: 문서 작업

### 커밋 메시지 (Conventional Commits)

```plaintext
<type>(<scope>): <subject>

<body>

<footer>
```

**Type 종류**:

- `feat`: 새 기능
- `fix`: 버그 수정
- `docs`: 문서
- `refactor`: 리팩토링
- `perf`: 성능 개선
- `test`: 테스트
- `chore`: 빌드/설정

**Scope (프로젝트)**:

- `karmo-toys`, `yawn-bot`, `karmo-hub`, `karmo-editor`, `karmo-ai`, `karmo-lab`

---

## 🔒 보안 및 설정 관리

### 핵심 원칙

- **민감 정보 노출 금지**: API 키, 비밀번호 등 소스 코드에 포함 금지
- **개발 환경**: .NET User Secrets 사용
- **운영 환경**: 환경 변수 사용

### 구현 예시

```csharp
// 환경 변수 조회
var apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY");

// .NET Configuration 시스템
var apiKey = configuration["Gemini:ApiKey"];
```

### 명령어

```bash
dotnet user-secrets init
dotnet user-secrets set "Gemini:ApiKey" "YOUR_KEY"
```

---

## 📦 Semantic Versioning

### 버전 형식

`MAJOR.MINOR.PATCH` (예: `1.2.3`)

- **MAJOR**: 호환성 깨지는 변경
- **MINOR**: 하위 호환 기능 추가
- **PATCH**: 하위 호환 버그 수정

### 사전 릴리스

- `1.0.0-alpha.1`: 알파 버전
- `1.0.0-beta.2`: 베타 버전
- `1.0.0-rc.1`: 릴리스 후보

### 적용 대상

- NuGet 패키지
- Unity 패키지
- npm 패키지
- 공식 릴리스

---

## 🧪 테스트 표준

### C# 프로젝트

- **프레임워크**: xUnit 또는 NUnit
- **커버리지**: 핵심 로직 80% 이상
- **네이밍**: `MethodName_Scenario_ExpectedResult`

### Unity 프로젝트

- **프레임워크**: Unity Test Framework
- **Play Mode Tests**: 게임플레이 로직
- **Edit Mode Tests**: 유틸리티, 에디터 확장

---

## 🔍 코드 리뷰 가이드

### 체크리스트

- [ ] 코딩 표준 준수
- [ ] 네이밍 규칙 일관성
- [ ] 적절한 주석 및 문서화
- [ ] 테스트 코드 포함
- [ ] 성능 고려사항 검토
- [ ] 보안 취약점 확인
- [ ] **빌드 검증 완료**: 모든 코드 수정 후 반드시 CLI(`dotnet build`, `Unity.exe -runTests` 등)를 통해 컴파일 에러 및 테스트 패스 여부를 확인하였는가? (수정하면 끝이 아님, 반드시 검증할 것)

### 리뷰 원칙

1. **건설적 피드백**: 개선 방향 제시
2. **명확한 근거**: 왜 변경이 필요한지 설명
3. **존중**: 긍정적이고 협력적인 태도
