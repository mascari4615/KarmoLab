# YawnBot 개발 가이드 (Development Convention)

Summary: YawnBot 프로젝트의 아키텍처, 데이터 관리 및 코딩 규칙 가이드라인.

## 1. 아키텍처 (SOA & DI)

YawnBot은 **서비스 지향 아키텍처(SOA)**와 **의존성 주입(DI)** 패턴 준수.

- **Services/**: 모든 비즈니스 로직은 `Service` 클래스로 구현.
- **Program.cs**: 애플리케이션 시작 지점에서 필요한 모든 서비스를 DI 컨테이너에 등록.
- **CommandService**: 디스코드 명령어 등록 및 라우팅 담당.

## 2. 데이터 관리

- **경로**: 모든 데이터 파일(.json 등)은 `Data/` 디렉터리에 저장.
- **접근**: 데이터를 직접 파일 입출력으로 다루지 말고, `GameDataService`와 같은 전용 서비스 클래스를 통해 접근.

## 3. 에러 처리 및 로깅

- **사용자 경험**: 명령어 실행 실패 시 사용자에게 친절하고 간단한 에러 메시지 제공.
- **내부 기록**: 상세 스택 트레이스 및 기술적 에러는 `LoggingService` 통해 `Data/error_logs.json` 기록.
- **안정성**: 개별 명령어 실패가 봇 전체 셧다운으로 이어지지 않도록 `try-catch` 블록으로 적절히 감쌈 필수.

## 4. 관리자 기능

- 관리자 전용 명령어는 반드시 `ConfigService.IsAdmin(userId)` 메서드를 통해 실행 권한 검증 필수.

## 5. 코딩 스타일 및 컨벤션

- **명시적 타입 사용**: var` 대신 명시적인 타입을 사용
  - 좋은 예: `DiscordSocketConfig config = new DiscordSocketConfig();`
  - 피해야 할 예: `var config = new DiscordSocketConfig();`
