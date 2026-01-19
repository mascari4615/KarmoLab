# IdleMonitorModule

사용자의 활동(Input)을 감지하여 컴패니언의 상태(수면/기상)를 관리하는 모듈임.

## 1. 개요

* **역할**: 시스템 전체의 유휴 시간(Idle Time)을 측정하여 일정 시간 이상 입력이 없으면 수면 모드('Zzz')로 전환함.
* **핵심 기술**:
  * Windows: `user32.dll`의 `GetLastInputInfo` API를 사용하여 **전역 입력(Global Input)** 감지.
  * Editor: `UpdateEditorIdle()`을 통해 Game View 내의 마우스/키보드 입력 감지 (Mocking).

## 2. 주요 기능

### 2.1 유휴 감지 (Idle Detection)

* **PC 전체**에 대한 키보드/마우스 입력을 감지함. (창이 비활성화되어 있어도 감지 가능 - Windows 빌드 시)
* 에디터에서는 편의상 Game View 포커스 상태에서의 입력만 감지하도록 시뮬레이션됨.
  * 에디터 테스트 시 마우스 감도(`1.0f`)를 조정하여 너무 민감하게 깨어나지 않도록 처리됨.

### 2.2 수면 모드 (Sleep Mode)

* 설정된 임계값(기본 30초, 테스트 시 10초) 이상 입력이 없으면 `EnterSleepMode()` 진입.
* **상태 변경**: `CompanionContext.CurrentState`를 `Sleeping`으로 변경.
* **채팅**: `ChatModule.ShowPersistentChat("Zzz...")`를 호출하여 사라지지 않는 말풍선 표시.
* **애니메이션**: `CompanionCharacter.SetSleepMode(true)` 호출 -> 아바타가 `SLEEP` 애니메이션 재생.

### 2.3 기상 (Wake Up)

* 입력이 감지되면 즉시 `ExitSleepMode()` 호출.
* **상태 변경**: `Normal` 상태로 복귀.
* **채팅**: "Hot!" (헛!) 등의 기상 대사 출력 (`isImportant=true`로 무시되지 않음).
* **애니메이션**: `CompanionCharacter.SetSleepMode(false)` 호출 -> 랜덤 아이들링(Idle Loop) 재개.

## 3. 구현 상세

* **Win32 API**: `WindowTransparencyUtils.GetIdleTimeSeconds()` 참조.
* **의존성**: `CompanionContext` (상태 공유), `ChatModule` (말풍선), `CompanionCharacter` (애니메이션).
