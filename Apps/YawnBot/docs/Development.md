# YawnBot 개발 문서 (Development Documentation)

Summary: YawnBot 프로젝트의 기술적 아키텍처, 메시지 시스템 및 코딩 가이드라인.

## 1. 프로젝트 구조

- **Modules/**: 디스코드 명령어(Interaction) 처리를 담당하는 모듈들이 위치함. (예: `GeneralModule`, `EnhancementModule`)
- **Services/**: 비즈니스 로직과 데이터 처리를 담당하는 서비스 클래스들이 위치함. (예: `GameDataService`, `EnhancementService`)
- **Models/**: 데이터 모델 및 Enum 정의가 위치함. (예: `BotMessageKey`, `SwordData`)
- **Data/**: 봇 운영에 필요한 데이터 파일(JSON)이 저장되는 경로임.

## 2. 메시지 시스템 (Bot Messages)

YawnBot은 모든 텍스트 메시지를 코드에서 분리하여 중앙에서 관리함. 이를 통해 코드의 가독성을 높이고 유지보수를 용이하게 함.

### 2.1. 구조

- **Enum (`BotMessageKey.cs`)**: 모든 메시지는 `BotMessageKey` Enum에 정의된 키로 식별됨.
- **Data (`bot_messages.json`)**: 실제 메시지 텍스트는 JSON 파일에 키-값 쌍으로 저장됨.
- **Service (`GameDataService`)**: `GetMessage(BotMessageKey key, params object[] args)` 메서드를 통해 메시지를 로드하고 포맷팅하여 반환함.

### 2.2. 새로운 메시지 추가 방법

새로운 기능을 개발하면서 봇이 출력할 메시지를 추가해야 할 경우 다음 절차를 따름.

1. **Enum 추가**: `Models/BotMessageKey.cs`에 새로운 Enum 멤버를 추가함. (Naming Convention: `[Category]_[Detail]_[Type]`, 예: `Enhance_Success_Title`)
2. **JSON 추가**: `Data/bot_messages.json`에 위에서 추가한 Enum 이름과 동일한 키로 메시지 내용을 추가함.
    - 포맷팅이 필요한 경우 `{0}`, `{1}` 등의 플레이스홀더를 사용함.
3. **코드 사용**: 서비스나 모듈에서 `_gameData.GetMessage(BotMessageKey.NewKey, arg1, arg2)` 형태로 호출함.

### 2.3. 디버깅 및 주의사항

- `bot_messages.json`의 키가 `BotMessageKey` Enum에 존재하지 않거나 오타가 있을 경우, 봇 시작 시 경고 로그가 출력됨.
- 포맷팅 인자 개수가 맞지 않을 경우 런타임 에러나 비정상적인 출력이 발생할 수 있으므로 주의해야 함.

## 3. 코딩 컨벤션

- **명시적 타입 사용**: `var` 키워드 사용을 지양하고 명시적인 타입을 사용함. (예: `EmbedBuilder embed = ...` 대신 `var embed` 사용 금지)
- **비동기 처리**: 가능한 모든 I/O 작업은 `async/await` 패턴을 사용함.
- 자세한 내용은 `Convention.md`를 참고바람.

## 4. 데이터 저장

- **자동 저장**: `GameDataService`는 주기적으로 게임 데이터를 파일에 저장함.
- **수동 저장**: `/admin 저장` 명령어를 통해 즉시 저장할 수 있음.
- 모든 데이터 조작은 `GameDataService`를 거쳐야 데이터 무결성이 보장됨.
