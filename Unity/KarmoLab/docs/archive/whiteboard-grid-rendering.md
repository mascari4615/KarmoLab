# 화이트보드 격자 렌더링 최적화

Summary: 화이트보드 격자 렌더링 동기화 문제 해결 및 LOD 시스템을 통한 시각적 성능 최적화 내역.

## 문제점

### 1. 격자 동기화 문제

- **증상**: 격자와 노드가 따로 움직임
- **원인**: GridBackground가 Canvas의 **자식**으로 배치되어 Canvas 변환과 이중 적용됨
- **해결**: GridBackground를 Canvas의 **형제**로 배치하여 고정, pan/zoom 정보만 수신

### 2. 축소 시 격자 과밀도

- **증상**: 줌 아웃 시 격자선이 너무 많아 화면이 답답함
- **원인**: 고정된 격자 간격이 모든 줌 레벨에 동일하게 적용됨
- **해결**: LOD(Level of Detail) 시스템 도입 (5배 단위 증가)

### 3. 모아레 패턴 및 앨리어싱

- **증상**: 축소 시 특정 선만 보이거나 굵게 표시됨, 선이 불균일함
- **원인**: 격자 간격이 화면 픽셀과 간섭하여 생기는 시각적 아티팩트
- **해결**: 정수 인덱스 기반 선 계산으로 일관된 위치 보장

---

## 핵심 개념

### 모아레 패턴 (Moiré Pattern)

규칙적인 패턴(격자)이 화면 픽셀과 간섭하여 생기는 간섭 무늬

**발생 원인**:

- 격자 간격과 픽셀 간격이 비슷할 때
- 스케일 변환으로 격자 간격이 불규칙해질 때
- 격자선이 부동소수점 위치에 그려져 픽셀 경계와 불일치

### 앨리어싱 (Aliasing)

선이 픽셀 경계와 정확히 맞지 않아 생기는 계단 현상 및 불균일한 렌더링

### LOD (Level of Detail)

줌 레벨에 따라 격자 밀도를 자동으로 조정하는 시스템

#### 적용한 방식: Adaptive LOD (5배 단위)

```csharp
float visualSize = _baseGridSize * _currentScale;
float stepMultiplier = 1.0f;
while (visualSize * stepMultiplier < 20f) 
    stepMultiplier *= 5.0f;
```

**LOD 동작 방식**:

| Visual Size | Step Multiplier | Actual Grid Size | 설명 |
| --- | --- | --- | --- |
| ≥ 20px | 1x | 50px | 기본 격자 |
| < 20px | 5x | 250px | 1단계 확대 |
| < 4px | 25x | 1250px | 2단계 확대 |
| < 0.8px | 125x | 6250px | 3단계 확대 |

**장점**:

- ✅ 화면에 항상 최소 20px 간격 유지
- ✅ 모아레 패턴 방지
- ✅ 부드러운 전환

---

## 핵심 해결책: UXML 구조 변경

### 문제가 있던 구조 ❌

```xml
<VisualElement name="WhiteboardRoot">
    <VisualElement name="Canvas">  <!-- pan/zoom 됨 -->
        <GridBackground />  <!-- Canvas와 함께 움직임 (이중 변환!) -->
    </VisualElement>
</VisualElement>
```

### 올바른 구조 ✅

```xml
<VisualElement name="WhiteboardRoot">
    <GridBackground />  <!-- 고정, pan/zoom 정보만 수신 -->
    <VisualElement name="Canvas">  <!-- pan/zoom 됨, 노드 포함 -->
    </VisualElement>
</VisualElement>
```

**차이점**:

- GridBackground는 **화면에 고정**되어 있음
- Canvas의 pan/zoom 정보를 **`UpdateView(pan, scale)`**로 수신
- GridBackground가 **직접 계산**하여 정확한 위치에 격자 렌더링

---

## 구현 상세

### 1. 효율적 렌더링: 화면 영역만 그리기

```csharp
// Canvas와 Viewport의 교집영만 계산
float drawStartX = Mathf.Max(0, canvasX);
float drawEndX = Mathf.Min(rect.width, canvasX + canvasW);

// 겹치는 영역이 없으면 렌더링 생략
if (drawEndX <= drawStartX || drawEndY <= drawStartY) return;
```

**효과**:

- 화면 밖 격자는 렌더링하지 않음
- 성능 최적화

### 2. 정수 인덱스 기반 선 계산

```csharp
// 격자 인덱스를 정수로 계산
float startN_X = Mathf.Ceil((drawStartX - canvasX) / scaledSpacing);
float endN_X = Mathf.Floor((drawEndX - canvasX) / scaledSpacing);

for (float n = startN_X; n <= endN_X; n++)
{
    float x = canvasX + (n * scaledSpacing);  // 정확한 위치
    painter.MoveTo(new Vector2(x, drawStartY));
    painter.LineTo(new Vector2(x, drawEndY));
}
```

**효과**:

- 격자선이 항상 **정수 인덱스의 배수** 위치에 그려짐
- 모아레 패턴 방지
- 일관된 렌더링

### 3. Pan/Zoom 동기화

**PanZoomManipulator.cs**:

```csharp
public GridBackground Grid { get; set; }

private void ApplyTransform()
{
    // Canvas 변환 적용
    transformTarget.style.translate = new Translate(_currentPosition.x, _currentPosition.y, 0);
    transformTarget.style.scale = new Scale(new Vector3(_currentScale, _currentScale, 1));
    
    // GridBackground에 정보 전달
    Grid?.UpdateView(_currentPosition, _currentScale);
}
```

**GridBackground.cs**:

```csharp
public void UpdateView(Vector3 pan, float scale)
{
    _panOffset = pan;
    _currentScale = scale;
    MarkDirtyRepaint();  // 다시 그리기
}
```

---

## 결과

### Before (문제 상황)

- ❌ 격자와 노드가 따로 움직임
- ❌ 축소 시 격자가 너무 촘촘함
- ❌ 특정 선만 보이거나 굵게 표시됨 (모아레 패턴)
- ❌ 격자가 불규칙하고 예측 불가능

### After (개선 후)

- ✅ 격자와 노드가 완벽히 동기화
- ✅ 줌 레벨에 따라 자동으로 적절한 간격 조정 (5배 단위)
- ✅ 모든 선이 균일하고 일관되게 표시
- ✅ 안정적이고 예측 가능한 렌더링
- ✅ 효율적인 성능 (화면 영역만 렌더링)

---

## 주요 파일

### GridBackground.cs

- 예전 작동하던 버전 (Commit `8ae4bb0`) 복원
- LOD: 5배 단위 증가, 20px 기준
- 화면 영역만 효율적으로 렌더링
- 정수 인덱스로 선 위치 계산

### PanZoomManipulator.cs

- `Grid` 프로퍼티 추가
- `ApplyTransform()`에서 `Grid.UpdateView()` 호출

### WhiteboardView.uxml

- **핵심**: GridBackground를 Canvas 밖으로 이동
- GridBackground와 Canvas를 형제 관계로 배치

### ProjectWhiteboardController.cs

- GridBackground를 WhiteboardRoot에서 쿼리 (Canvas 아님)
- PanZoomManipulator에 Grid 전달

---

## 참고 자료

- **모아레 패턴**: 규칙적 패턴 간섭으로 생기는 시각적 아티팩트
- **앨리어싱**: 픽셀 경계 불일치로 생기는 렌더링 문제
- **LOD**: 거리/스케일에 따라 디테일을 조정하는 최적화 기법
- **정수 인덱스 기반 렌더링**: 일관된 위치 보장으로 시각적 아티팩트 방지

---

## 교훈

### 문제 해결 과정

1. **잘못된 접근**: 픽셀 스냅, 10배 LOD, 알파 페이드 등 다양한 시도
2. **근본 원인 발견**: Git 히스토리에서 작동하던 버전 발견
3. **핵심 차이 식별**: UXML 구조 - GridBackground의 위치
4. **최종 해결**: 예전 버전 복원 + 구조 수정

### 핵심 교훈
>
> **복잡한 문제는 새로운 기법보다 근본 원인을 찾는 것이 중요함**
>
> "이전에 작동했던 방식"을 먼저 확인하고, 무엇이 달라졌는지 비교하라.

---

**작성일**: 2026-01-23  
**최종 해결**: Git Commit `8ae4bb0` 기반 복원 + UXML 구조 수정  
**관련 파일**: `GridBackground.cs`, `PanZoomManipulator.cs`, `WhiteboardView.uxml`, `ProjectWhiteboardController.cs`
