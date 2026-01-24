# Unity UI Toolkit: Template System & Instance Guide

Summary: UXML 템플릿의 선언, 인스턴스화 과정과 TemplateContainer의 레이아웃 제약 사항에 대한 안내.

## Template vs Instance

- **Template**: 다른 UXML 파일을 재사용 가능한 부품으로 선언함. (`ui:Template`)
- **Instance**: 선언된 템플릿을 실제 화면 계층에 배치함. (`ui:Instance`)

## 💡 주요 발견 및 주의 사항 (Warning)

### 1. TemplateContainer의 레이아웃 제약

`ui:Instance`를 배치하면 Unity는 내부적으로 `TemplateContainer`라는 특수 요소를 생성함. 이 요소는 기본적으로 **부모의 레이아웃 엔진(Flexbox)에 소속됨**.

> [!CAUTION]
> **Z-Order 함정**: 오버레이(Modal)를 일반 컨텐츠 컨테이너 내부에 `Instance`로 넣으면, `absolute`를 주더라도 형제 요소들과의 Z-Order 싸움에서 질 수 있음. (부모 레이어의 한계에 갇힘)

### 2. 최상위 오버레이 구현 규칙

화면 최상위에 뜨는 팝업을 만들려면 반드시 다음 규칙을 지킬 것:

1. **메인 컨테이너 외부 배치**: `MainView.uxml`의 루트(`ui:UXML`) 직속 자식으로 배치할 것.
2. **명시적 스타일 부여**: `Instance` 태그에 직접 `style="position: absolute; ..."`를 부여하여 레이아웃을 독립시킬 것.
3. **입력 모드 관리**: `picking-mode="Ignore"`를 초기값으로 주고 C#에서 토글할 것.

## 🛠️ 문제 해결 (Troubleshooting)

### `ArgumentException: The input asset name cannot be empty`

- **원인**: `ui:Template`의 `src` 경로에서 자산을 식별하지 못해 빈 결과가 반환될 때 발생함.
- **해결**: `src` 경로 끝에 `#TemplateName` (UXML 내부의 루트 요소 이름 혹은 파일명) 접미사를 추가하여 식별을 명확히 함.
- **예시**: `src=".../View.uxml#View"`

### `Syntax - Xml is not valid` (XmlException)

- **원인**: 루트 태그(`ui:UXML`)의 네임스페이스 선언 오타.
- **해결**: `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` 형식을 정확히 지킬 것. `xmlns:` 접두사 누락 주의.

## 📄 표준 코드 예시

### MainView.uxml

```xml
<ui:UXML ...>
    <ui:Template name="MyPopup" src=".../MyPopup.uxml#MyPopup" />
    
    <ui:VisualElement name="MainContent" /> <!-- 일반 화면 -->

    <!-- 오버레이: 루트 직속, 인스턴스에 스타일 직접 부여 -->
    <ui:Instance template="MyPopup" picking-mode="Ignore"
        style="position: absolute; left: 0; top: 0; right: 0; bottom: 0;" />
</ui:UXML>
```

---
**업데이트**: 2026-01-24 (모달 시스템 구축 중 발견된 파싱 에러 및 레이아웃 제약 사항 반영)
