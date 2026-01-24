# Modal Z-Order 근본 원인 및 해결

## 근본 원인 분석

### Toast가 작동하는 이유

```csharp
// KarmoToysApp.cs:146
Toast = new ToastService(root.Q("ToastContainer"));
```

- **ToastContainer는 UXML에 정의**됨
- MainView 내부의 content-area에 위치
- `position: absolute; right: 0; bottom: 0;`로 부모(content-area)를 기준으로 위치

### Modal이 실패하는 이유

1. **Template Instance의 한계**: `<ui:Instance template="ModalView" />`는 **부모 요소의 계층 제약**을 받음
2. **Container의 flexbox 영향**: Container는 `flex-direction: row`
3. **position: absolute의 동작**: Unity UI Toolkit에서는 positioned ancestor를 기준으로 상대 위치 결정

## 해결 방안

**Modal을 C#에서 동적으로 생성하여 `panel.visualTree`에 직접 추가**

### 구현

#### 1. MainView.uxml에서 Modal Instance 제거

```xml
<!-- 제거함 -->
<!-- <ui:Instance template="ModalView" /> -->
```

#### 2. ModalView.uxml을 Resources 폴더로 복사

```
Assets/Resources/ProjectManager/Modal/ModalView.uxml
```

#### 3. ProjectManagerFeature.cs에서 동적 생성

```csharp
// Modal - C#에서 동적 생성하여 panel.visualTree에 직접 추가
Object modalAssetObj = Resources.Load("ProjectManager/Modal/ModalView");

if (modalAssetObj != null)
{
    VisualTreeAsset modalAsset = modalAssetObj as VisualTreeAsset;
    TemplateContainer modalInstance = modalAsset.Instantiate();
    root.panel.visualTree.Add(modalInstance);  // 최상위 레벨
    
    VisualElement modalElement = modalInstance.Q("ProjectDetailModal");
    _detailModal = new ProjectDetailModal(this, modalElement);
}
```

### 장점

- ✅ 최상위 레벨 보장
- ✅ 부모 계층의 flexbox/position 영향 없음
- ✅ 완전한 z-order 제어
- ✅ UXML 계층 독립

## 핵심 교훈

**Unity UI Toolkit에서 최상위 레벨 UI 요소는 C#에서 `panel.visualTree.Add()`로 추가해야 함**

Template Instance는 항상 부모 UXML 계층 내에서만 작동합니다.

---

**작성일**: 2026-01-24  
**관련 파일**: `ProjectManagerFeature.cs`, `MainView.uxml`, `ModalView.uxml`
