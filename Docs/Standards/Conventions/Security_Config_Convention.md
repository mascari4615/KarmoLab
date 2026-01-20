# 보안 및 설정 관리 표준 (Security & Config Standard)

Summary: KarmoLab 프로젝트의 API 키 및 민감 설정 관리 가이드라인.

## 1. 개요 (Overview)

소스 코드와 설정(Configuration)을 엄격히 분리하여 보안 사고를 예방하고, 개발-배포 환경 간의 이식성을 높이는 것을 목적으로 함. (Twelve-Factor App 원칙 준수)

## 2. 핵심 원칙 (Core Rules)

### 2.1. 민감 정보 노출 금지

- API 키, 데이터베이스 연결 문자열, 비밀번호 등 민감한 정보는 **절대로** 소스 코드나 프로젝트 폴더 내의 물리적 파일(`.env`, `appsettings.json` 내 하드코딩 등)에 포함하지 않음.
- `.env.template` 등의 샘플 파일 배포도 지양하며, 필요한 환경 변수 목록은 `README.md`나 본 표준을 참조하도록 함.

### 2.2. 개발 환경: .NET User Secrets

- 로컬 개발 시에는 .NET의 **Secret Manager**를 사용함.
- 설정값은 프로젝트 외부(`%APPDATA%\Microsoft\UserSecrets\`)에 저장되므로 Git 오커밋 위험이 없음.
- **명령어 예시**:

  ```bash
  dotnet user-secrets init
  dotnet user-secrets set "Gemini:ApiKey" "YOUR_ACTUAL_KEY"
  ```

### 2.3. 운영 및 런타임 환경: 환경 변수 (Environment Variables)

- Docker, CI/CD, 클라우드 환경에서는 **시스템 환경 변수**를 최우선으로 사용함.
- 애플리케이션은 환경 변수에서 값을 읽어오도록 설계함.

## 3. 코드 구현 지침

- **표준 API 사용**: 특정 파일 포맷(`.env`)을 파싱하는 라이브러리 의존성을 제거함.
- **C# 예시**:

  ```csharp
  // 1. 단순 환경 변수 조회
  var apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY");

  // 2. .NET Configuration 시스템 활용 (권장)
  var apiKey = configuration["Gemini:ApiKey"]; 
  ```

## 4. 제거 대상 (Cleanup Target)

- 기존 프로젝트 내의 `.env` 파일 및 관련 로더 로직.
- Git 추적 중인 `.env.template` 파일.

---
> **승인자**: Alisa (PM)  
> **날짜**: 2026-01-20
