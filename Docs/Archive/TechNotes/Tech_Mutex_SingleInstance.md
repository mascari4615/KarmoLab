# Tech Note: Mutex를 이용한 중복 실행 방지

## 1. Mutex란?

- **Mutual Exclusion(상호 배제)**의 약자임.
- OS 레벨에서 공유 자원에 대한 동시 접근을 제어하기 위한 동기화 객체임.
- 이름이 있는(Named) Mutex를 사용하면 서로 다른 프로세스 간에도 식별이 가능하여, 프로그램이 이미 실행 중인지 확인하는 용도로 자주 쓰임.

## 2. 작동 원리

1. 앱 시작 시 특정 이름(`Global\KarmoLab_Main` 등)으로 Mutex 생성을 시도함.
   - **`Global\` 접두사**: 모든 세션(로그인 사용자)에서 접근 가능한 전역 네임스페이스에 Mutex를 생성함. 이를 통해 서로 다른 사용자로 로그인되어 있어도 중복 실행을 방지할 수 있음 (Windows 커널 오브젝트 표준).
   - **`Local\` 접두사**: 현재 로그인된 사용자의 세션 내에서만 유효함.
2. `createdNew` 값이 `true`면 현재 이 이름을 가진 Mutex가 없다는 뜻이므로 내가 첫 번째 인스턴스가 됨.
3. `false`면 이미 다른 프로세스가 이 이름의 Mutex를 들고 있다는 뜻이므로, 중복 실행으로 판단하고 종료함.

## 3. 발생했던 이슈: Unity Editor 점유 문제

- **상황**: Unity Editor에서 Play Mode를 실행하면 `Awake()`가 호출되면서 Editor 프로세스가 Mutex를 생성/점유함.
- **결과**: Play Mode가 끝나도 에디터가 살아있는 한 Mutex가 해제되지 않아, 별도로 빌드된 `.exe` 파일을 실행하려고 하면 "이미 실행 중"으로 판단되어 켜지지 않음.
- **해결**: `#if !UNITY_EDITOR` 전처리기를 사용하여 에디터 환경에서는 Mutex 로직을 타지 않도록 격리함.

## 4. 관련 코드

- [KarmoToysApp.cs](file:///c:/Users/masca/source/repos/_Mascari4615/KarmoLab/Unity/KarmoLab/Assets/KarmoToys/Main/KarmoToysApp.cs)의 `CheckSingleInstance()` 함수 참고.
- 강제 해제가 필요할 땐 [MutexKiller.cs](file:///c:/Users/masca/source/repos/_Mascari4615/KarmoLab/Unity/KarmoLab/Assets/Editor/MutexKiller.cs) 유틸리티 사용.
