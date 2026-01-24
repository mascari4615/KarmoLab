# Unity UI Toolkit: TemplateContainer 높이 단절 가이드

Summary: `<ui:Instance>` 사용 시 발생하는 `TemplateContainer`의 높이 차단 문제 해결을 위한 스마트 스코핑(Smart Scoping) 패턴 정리.

## 1. 현상 (Problem)

- `<ui:Instance>`로 삽입한 서브 UXML 컨텐츠가 `flex-grow: 1`임에도 불구하고 높이가 확장되지 않는 현상.
- 부모 엘리먼트의 높이가 자식에게 전달되지 않고 중간에서 끊김.

## 2. 원인 (Root Cause)

- Unity는 런타임에 인스턴스화된 UXML을 `TemplateContainer`라는 숨겨진 엘리먼트로 감쌈.
- 이 컨테이너가 기본적으로 `flex-grow: 0`이며 높이 전달을 차단하는 "블랙홀" 역할을 수행함.

## 3. 해결 핵심: 스마트 스코핑 (Smart Scoping) 패턴

가장 깔끔하고 권장되는 방법은 부모 컨테이너의 ID나 클래스를 기준으로 하위의 모든 템플릿 구조에 높이 확장을 자동 적용하는 것임.

### USS 정의 (권장)

특정 피처의 전용 USS 파일에서 계층 구조 선택자를 정의하여 자동 확장을 유도함.

```css
/* #ProjectContent 내부의 모든 래퍼, 템플릿, 루트 자식을 자동으로 확장 */
#ProjectContent,
#ProjectContent > VisualElement,
#ProjectContent TemplateContainer,
#ProjectContent TemplateContainer > * {
    flex-grow: 1;
    height: 100%;
}
```

### UXML 적용

UXML에서는 더 이상 명시적인 확장 클래스(`.stretch-container` 등)를 수동으로 추가할 필요가 없음.

```xml
<!-- 부모 UXML: 계층 구조만 유지하면 자동 확장됨 -->
<ui:VisualElement name="ProjectContent">
    <ui:VisualElement name="TableWrapper">
        <ui:Instance template="TableView" />
    </ui:VisualElement>
</ui:VisualElement>
```

## 4. 주의사항 (Caution)

- **전역 적용 금지**: `MainStyle.uss` 등에 `TemplateContainer { flex-grow: 1; }`처럼 너무 넓게 지정하면, 고유 크기를 가져야 하는 Modal이나 ContextMenu까지 늘어나 레이아웃이 파손됨.
- **컨텍스트 활용**: 반드시 해당 피처가 지배하는 ID(예: `#ProjectContent`)를 선택자의 시작점으로 사용하여 영향 범위를 제한할 것.
마크다운 문서엔 음슴체를 쓰겠음.
