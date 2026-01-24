# Unity UI Toolkit: 핵심 개념 가이드 (UXML, USS, TSS, Panel Settings)

Unity UI Toolkit은 웹 개발(HTML/CSS)과 유사한 구조를 가짐. 각 구성 요소의 역할과 상호 관계를 이해하는 것이 필수적임.

---

## 1. UXML (Unity XML) - **구조 (Structure)**

### UXML 개념

- 웹의 **HTML**에 해당함.
- UI의 **계층 구조(Hierarchy)**와 구성 요소(Button, Label 등)를 정의함.
- XML 형식의 시각적 '뼈대' 역할을 수행함.

### UXML 특징

- **Template & Instance**: UXML 파일 조립을 통한 재사용성 확보.
- **Hierarchical**: 부모-자식 관계 기반의 레이아웃 구성.

---

## 2. USS (Unity Style Sheet) - **디자인 (Design)**

### USS 개념

- 웹의 **CSS**에 해당함.
- UXML 뼈대에 **색상, 크기, 폰트, 배치(Flexbox)** 등의 스타일을 적용함.

### USS 특징

- **Selector**: 이름(`name`), 클래스(`class`), 태그 타입을 통한 타겟팅.
- **Variables**: `--color-primary` 등 디자인 토큰(변수) 정의 가능.
- **Flexbox**: 웹 표준과 동일한 방식의 반응형 레이아웃 구현.

---

## 3. TSS (Theme Style Sheet) - **테마 (Theme)**

### TSS 개념

- 여러 USS 파일을 결합하여 관리하는 **상위 관리자**.
- 프로젝트 **전역 스타일 정책**을 총괄함.

### TSS 특징

- **@import**: 다수의 USS 파일을 하나의 테마로 병합.
- **Global Injection**: 모든 UXML에 개별 추가 없이 스타일 전역 주입 가능.

---

## 4. Panel Settings - **렌더링 (Rendering)**

### Panel Settings 개념

- UI Toolkit의 **엔진 설정 자산**.
- UI의 **물리적 출력 및 해상도 대응 규칙**을 결정함.

### Panel Settings 주요 설정

- **Theme Style Sheet**: 적용할 TSS(테마) 지정.
- **Scale Mode**: 해상도 변화에 따른 UI 스케일링 방식 결정.
- **Text Root Settings**: 공통 폰트 및 텍스트 렌더링 품질 설정.

---

## 🛠️ 요약: 구성 요소 간의 관계

| 구성 요소 | 웹 대응 | 역할 | 특징 |
| :--- | :--- | :--- | :--- |
| **UXML** | HTML | 뼈대 구성 | 계층 구조, 부품 재사용 |
| **USS** | CSS | 디자인 적용 | 스타일 속성, 변수 활용 |
| **TSS** | - | 테마 관리 | USS 결합 및 전역 전파 (@import) |
| **Panel Settings** | Browser Engine | 렌더링 설정 | 해상도 대응, 테마 활성화 |

---

## 💡 TSS 활용 이점

1. **중복 제거**: 모든 UXML에 스타일 링크를 걸 필요가 없어 코드가 간결해짐.
2. **전역 테마 전환**: TSS 파일 교체만으로 다크/라이트 모드 등의 전체 테마 변경 지원.
3. **변수 전파 완화**: 템플릿 독립성에 구애받지 않고 CSS 변수(`var(--)`)를 완벽하게 상속함.

**작성일**: 2026-01-24  
**상태**: 컨벤션(음슴체) 준수 및 MD024 린트 수정 완료 ✅
