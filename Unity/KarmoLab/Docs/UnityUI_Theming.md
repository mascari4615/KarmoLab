# Unity UI Toolkit 테마 및 스타일링 가이드 (USS vs TSS)

이 문서는 Unity UI Toolkit에서 스타일을 관리하는 두 가지 핵심 파일 형식인 **USS (Unity Style Sheet)**와 **TSS (Theme Style Sheet)**의 차이점, 역할, 그리고 상호 관계를 설명합니다.

## 1. USS (Unity Style Sheet)
**"구체적인 디자인 명세서 (옷)"**

USS는 웹 개발의 **CSS(Cascading Style Sheets)**와 매우 유사하며, UI 요소의 **구체적인 스타일(색상, 폰트, 크기, 레이아웃)**을 정의하는 파일입니다.

### 특징 및 역할
- **스타일 정의**: "버튼 배경은 파란색", "글자 크기는 14px"과 같은 실제 디자인 코드가 들어갑니다.
- **적용 범위 (Local)**: 주로 특정 **UXML(화면 레이아웃)** 파일에 연결되어, 그 화면 내부에 존재하는 요소들에만 스타일을 입힙니다.
- **한계**: 화면(UXML) 구조 밖에서 생성되는 요소(예: 드롭다운 팝업, 툴팁 등)에는 스타일이 자동으로 적용되지 않는 경우가 많습니다.

### 예시 코드
```css
/* PlannerStyle.uss */
.my-button {
    background-color: blue;
    color: white;
}
```

---

## 2. TSS (Theme Style Sheet)
**"전역 테마 설정 파일 (회사 복장 규정)"**

TSS는 애플리케이션 **전체에 적용될 기본 테마**를 정의하는 파일입니다. 직접 스타일 코드를 작성하기보다는, 여러 USS 파일을 불러와서(Import) **"이 앱의 기본 스타일은 이것이다"**라고 선언하는 역할을 합니다.

### 특징 및 역할
- **전역 설정**: `Panel Settings` 에셋의 **Theme Style Sheet** 속성에 할당되어 앱 전체에 영향을 미칩니다.
- **팝업/오버레이 지원**: 드롭다운(Dropdown), 팝업 메뉴 등 메인 UXML 계층 구조 밖(Root 외부)에 렌더링되는 요소들은 부모 UXML의 USS를 상속받지 못합니다. 이때 TSS가 전역적으로 스타일을 주입해줍니다.
- **상속 구조**: 보통 유니티의 기본 런타임 테마(`unity-theme://default`)를 상속받고, 그 위에 커스텀 USS를 덮어쓰는 방식으로 작동합니다.

### 예시 코드
```css
/* PlannerTheme.tss */
@import url("unity-theme://default"); /* 유니티 기본 테마 상속 */
@import url("PlannerStyle.uss");      /* 커스텀 스타일 전역 적용 */
```

---

## 3. 요약 및 적용 방법

| 구분 | USS (Unity Style Sheet) | TSS (Theme Style Sheet) |
| :--- | :--- | :--- |
| **비유** | 옷 한 벌 (Style) | 복장 규정 (Rule / Policy) |
| **내용** | 색상, 폰트 등 실제 디자인 코드 | USS 파일 Import 목록 |
| **적용 대상** | 특정 UXML 화면 내부 요소 | 앱 전체 (팝업, 드롭다운 포함) |
| **확장자** | `.uss` | `.tss` |

### 드롭다운(Dropdown) 스타일이 적용되지 않을 때 해결법
1. 스타일을 정의한 `.uss` 파일을 만듭니다. (예: `PlannerStyle.uss`)
2. `.tss` 파일을 생성하고(우클릭 > Create > UI Toolkit > Theme Style Sheet), 위 USS를 import 합니다.
3. **Panel Settings** 에셋 (보통 `Assets/Settings` 등에 위치)을 찾습니다.
4. Inspector 창의 **Theme Style Sheet** 항목에 만든 `.tss` 파일을 할당합니다.

이렇게 하면 화면 밖으로 튀어나오는(Expanded) 드롭다운 리스트에도 스타일이 정상적으로 적용됩니다.
