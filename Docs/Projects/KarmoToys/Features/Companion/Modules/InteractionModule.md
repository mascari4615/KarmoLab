# InteractionModule (UI & Input)

`InteractionModule`은 사용자와 컴패니언 간의 **직접적인 상호작용**과 **UI 제어**를 담당하는 핵심 모듈입니다. 마우스 입력(드래그, 클릭) 처리뿐만 아니라, 컴패니언의 설정 및 기능 제어를 위한 UI 패널을 관리합니다.

## 주요 역할 (Responsibilities)

1. **Input Handling (입력 처리)**
    * **Drag & Drop**: 캐릭터를 마우스로 집어 들어 화면 내 다른 위치로 이동시킵니다.
    * **Click**: 캐릭터를 클릭하여 상호작용하거나 대사를 유발합니다.
    * **Transparency Hit Test**: 투명한 윈도우 환경에서도 마우스 입력을 정확히 캐릭터에게 전달합니다.

2. **Settings UI (설정 패널)**
    * `⚙️` 버튼을 통해 접근 가능한 런타임 설정 패널을 제공합니다.
    * **Tap System**: 기능을 그룹화하여 탭으로 제공합니다.
        * **Avatar Tab**: 아바타 교체 및 애니메이션 확인.
        * **Time Tab**: 스톱워치, 타이머 관리 및 HUD 설정.
    * **Responsive Update**: UI 요소의 재생성을 최소화하고, 텍스트 데이터만 실시간으로 갱신하여 성능과 입력 반응성을 최적화했습니다.

3. **Overhead HUD (Heads-Up Display)**
    * 캐릭터 머리 위에 현재 수행 중인 작업(타이머, 스톱워치)의 시간을 실시간으로 표시합니다.
    * **Auto-Follow**: `Camera.WorldToScreenPoint`를 사용하여 캐릭터의 움직임을 매 프레임 추적합니다.
    * **Customization**: 슬라이더를 통해 HUD의 표시 높이(`HudOffset`)를 조절할 수 있으며, 이 값은 영구 저장됩니다.

## 주요 클래스 및 데이터

* `InteractionModule`: 모듈 메인 클래스.
* `CompanionData` (in `KarmoToysData`): HUD 오프셋 등 UI 관련 지속성 데이터를 저장합니다.

## 연동 모듈

* **TimeModule**: 스톱워치 및 타이머 상태를 조회하여 UI에 표시합니다.
* **ChatModule**: UI 조작(버튼 클릭 등) 시 캐릭터의 반응 대사를 출력합니다.
