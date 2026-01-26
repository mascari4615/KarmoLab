# Unity UI Toolkit: 화면 최상위 오버레이 구현 및 문제 해결 가이드

Summary: 모달(Modal) 및 토스트(Toast) 등 최상위 레이어 UI 구현 전략 및 트러블슈팅 가이드.

## 목표

다른 모든 UI 요소 위에 표시되는 오버레이(Modal, Toast 등)를 구현하고, 발생 가능한 에러를 방지함.

## 1. 최상위 레이어 보장 전략 (Z-Order 해결)

### 핵심 원리

Unity UI Toolkit에서 `Template Instance`를 사용하면 내부적으로 `TemplateContainer`가 생성됨. 이 컨테이너는 기본적으로 `position: relative`이며 부모의 레이아웃 흐름을 따름.

### 해결책: UI 계층 구조 분리

```xml
<!-- MainView.uxml -->
<ui:UXML ...>
    <!-- 1. 앱의 메인 컨텐츠 (Flexbox 레이아웃) -->
    <ui:VisualElement name="Container" class="root-container">
        <!-- Sidebar, Main Body 등 -->
    </ui:VisualElement>

    <!-- 2. 오버레이 레이어 (Container 외부, 하단에 배치) -->
    <!-- 핵심: Instance에 직접 absolute 스타일 부여 -->
    <!-- 주의: Instance 자체에 고유 name을 부여하여 C#에서 정밀 제어함 -->
    <ui:Instance name="ModalInstance" template="ModalView" picking-mode="Ignore" 
        style="position: absolute; left: 0; top: 0; right: 0; bottom: 0;" />
</ui:UXML>
```

### 필수 명명 규칙 (Naming Rule)

- 오버레이 인스턴스에는 반드시 `~Instance`와 같은 고유한 이름을 부여함.
- `root.Q("ModalView")` 등 템플릿 이름으로 쿼리할 경우 의도치 않은 요소가 잡힐 수 있으므로, 인스턴스 전용 이름을 사용하는 것이 안전함.

---

## 2. 발생했던 오류 및 재발 방지 대책 (Troubleshooting)

### 에러 1: `ArgumentException: The input asset name cannot be empty`

- **현상**: `ResolveTemplate` 호출 시 발생하며 UI 로딩이 중단됨.
- **원인**: `ui:Template`의 `src` 경로가 불안전하거나, Unity가 자산을 식별하는 데 필요한 식별자가 누락됨.
- **방지책**:
  - `src` 경로 뒤에 반드시 `#TemplateName` 접미사를 붙여 자산을 명확히 식별함.
  - 예: `src="project://database/.../ModalView.uxml#ModalView"`
  - 불필요한 `guid`, `fileID` 쿼리 파라미터는 환경 변경 시 충돌을 일으키므로 가급적 제거하고 순수 경로 + `#Name` 조합을 사용할 것.

### 에러 2: `XmlException: The ':' character cannot be included in a name`

- **현상**: UXML 파싱 실패.
- **원인**: XML 네임스페이스 선언 오타. (예: `xsi:http...`라고 작성하여 `:`를 속성 이름의 일부로 오인하게 함)
- **방지책**: 표준 네임스페이스 선언 형식을 엄격히 준수함.
  - **올바른 예**: `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`

### 에러 3: 모달을 닫아도 버튼이 안 눌리는 문제 (Input Blocking)

- **현상**: 모달이 시각적으로는 사라졌으나(`display: none`), 투명한 레이어가 화면 전체를 덮어 클릭을 가로막음.
- **방지책**:
  - UXML 인스턴스 초기 상태에 `picking-mode="Ignore"` 부여.
  - C# `Open()` 시: `pickingMode = PickingMode.Position;` (입력 활성)
  - C# `Close()` 시: `pickingMode = PickingMode.Ignore;` (입력 통과)

### 에러 4: 모달이 처음부터 켜져 있는 문제

- **현상**: `display: none`을 줬음에도 무시됨.
- **원인**: 인라인 스타일 내부에 `display` 속성이 중복 정의되어 마지막 값이 적용됨. (예: `display: none; ... display: flex;`)
- **방지책**: 스타일 속성 중복을 전수 검사하고, 기본 레이아웃 모드(`flex`, `center` 등)는 유지하되 `display`는 하나만 명시할 것.

### 에러 5: 절대 좌표(Absolute) 좌표 충돌 및 늘어남 현상

- **현상**: 오버레이가 화면 끝까지 비정상적으로 늘어나거나 위치가 꼬임.
- **원인**: 부모 인스턴스에 `right: 0`, `bottom: 0` 등 고정 좌표가 설정된 상태에서, C# 스크립트가 해당 인스턴스의 `left`, `top`을 마우스 위치로 옮기려 할 때 발생. (네 방향이 모두 고정되어 크기가 강제로 확장됨)
- **방지책**:
  - **전체 화면 컨테이너**는 `0,0,0,0` 좌표로 고정하여 오버레이 역할만 수행하게 함.
  - 실제 위치 이동이 필요한 **내용물(Content)**에 `position: absolute`를 주고, 스크립트에서는 이 내용물의 좌표만 수정함.

---

## 3. UXML 표준 헤더 템플릿 (복사용)

새 UXML 생성 시 아래 형식을 기본으로 사용함 (오류 방지 검증됨):

```xml
<ui:UXML xmlns:ui="UnityEngine.UIElements" 
         xmlns:uie="UnityEditor.UIElements" 
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
         engine="UnityEngine.UIElements" 
         editor="UnityEditor.UIElements" 
         xsi:noNamespaceSchemaLocation="../../../../../UIElementsSchema/UIElements.xsd" 
         editor-extension-mode="False">
    <!-- 스타일 및 템플릿 정의 -->
</ui:UXML>
```

---

## 4. C# 컨트롤러 표준 패턴

```csharp
public void Open()
{
    _root.style.display = DisplayStyle.Flex; // 표시
    _root.pickingMode = PickingMode.Position; // 클릭 차단(모달 배경)
    _root.BringToFront(); // 다시 한 번 계층 최상위 확인
}

public void Close()
{
    _root.style.display = DisplayStyle.None; // 숨김
    _root.pickingMode = PickingMode.Ignore; // 클릭 통과
}
```

---

## 요약 (절대 규칙)

1. **배치**: 오버레이 인스턴스는 항상 `Container` 밖, `UXML` 루트 바로 아래 둘 것.
2. **스타일**: 오버레이 인스턴스에 직접 `position: absolute`와 전체 화면 크기를 줄 것.
3. **명명**: 인스턴스 식별을 위해 고유한 `name`을 반드시 부여할 것.
4. **분리**: 오버레이 컨테이너(전체)와 실제 UI 내용물(이동 가능)의 스타일/좌표 관리를 명확히 분리할 것.
5. **입력**: `pickingMode`를 `display`와 함께 반드시 토글할 것.

**최종 수정일**: 2026-01-26  
**검토**: 5가지 주요 에러 및 레이아웃 분리 전략 추가 ✅
