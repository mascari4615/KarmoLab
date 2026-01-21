# 유니티 에디터 패키지 제작 가이드 🐾

KarmoEditor 개발 과정을 통해 정립된, 고품질 유니티 패키지 제작 시 반드시 고려하고 구현해야 할 요소들임.

## 1. 구조 및 명명 규칙 (Structure & Naming)

- **Namespace**: `OrganizationName.PackageName.SubComponent` 형식을 고수할 것. (예: `KarmoLab.KarmoEditor.Builder`)
- **Prefix**: 패키지 내 주요 클래스와 파일명에 패키지 고유 접두사를 붙여 외부 에셋과의 충돌을 방지할 것.
- **Define**: 공통 사용 상수(메뉴 경로, 로그 접두사, 저장 경로 등)는 `Define.cs` 한곳에서 관리할 것.

## 2. 접근성 및 통합 (Accessibility)

- **SettingsProvider**: 설정을 별도 에셋으로 찾게 하지 말고 `Project Settings`나 `Preferences` 창에 통합할 것.
- **Quick Search**: 유니티의 전역 검색(`Ctrl+K`)에 기능을 연동하여 마우스 이동을 최소화할 것.
- **Shortcuts**: 빈번하게 사용하는 기능은 단축키를 반드시 제공할 것. (`%&` : Ctrl+Alt 활용 추천)

## 3. 사용자 경험 (UX/UI Toolkit)

- **Welcome Wizard**: 패키지 설치 후 무엇을 해야 할지 알려주는 자동 팝업 창을 만들 것. (`[InitializeOnLoad]`)
- **Custom Inspector**: `ReorderableList` 등을 활용해 기본 리스트보다 직관적인 편집 환경을 제공할 것.
- **Feedback**: 성공/실패 시 `Define.LogPrefix`를 사용한 명확한 로그와 다이얼로그 피드백을 줄 것.

## 4. 로컬라이징 및 문서화 (Localization & Docs)

- **Localization**: 초기부터 한국어/영어 대응이 가능하도록 텍스트 관리 클래스를 분리할 것.
- **README/CHANGELOG**: 패키지 루트에 표준 규격의 문서를 작성하여 변경 사항을 추적 가능하게 할 것.
- **Samples**: `Samples~` 폴더를 사용하여 사용자가 즉시 테스트해 볼 수 있는 예제 데이터를 포함할 것. (물리적 임포트 유도)

## 5. 정합성 유지 (Health Check)

- **Default Path**: 패키지가 생성하는 에셋의 기본 위치를 `Assets/Settings/...` 등 프로젝트 표준 경로로 유도할 것.
- **Validation**: 유효하지 않은 설정이나 누락된 에셋을 감지하고 알려주는 로직을 포함할 것.
