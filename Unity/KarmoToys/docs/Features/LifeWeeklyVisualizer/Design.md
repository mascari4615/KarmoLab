# 라이프 위클리 디자인 (Life Weekly Visualizer Design)

Summary: 5,200주 인생 시각화 도구의 데이터 모델, UI 구조 및 성능 최적화 설계 사양.

## 1. 개요

`LifeWeeklyVisualizer` 피처를 `KarmoToys` 아키텍처에 맞춰 구현하기 위한 기술적 설계 문서.

## 2. 구조 설계

### 2.1. Feature Class

- **Class**: `LifeWeeklyFeature` (Inherits `FeatureBase`)
- **Namespace**: `KarmoToys.Features.LifeWeekly`
- **Responsibility**:
  - 5200개 블록 생성 및 상태 업데이트.
  - 생년월일 설정 UI 관리.
  - 그리드 레이아웃 최적화.

### 2.2. 데이터 모델

```csharp
[Serializable]
public class LifeWeeklyData
{
    public string BirthDate; // "yyyy-MM-dd"
    public int TargetAge = 100; // 기본 100세
    public List<LifeMilestone> Milestones = new();
}

[Serializable]
public class LifeMilestone
{
    public string Date;
    public string Description;
    public string Color;
}
```

## 3. UI/UX 디자인 (UI Toolkit)

### 3.1. 레이아웃 (UXML)

- **Container**: `ScrollView` (세로 스크롤 대응)
- **Grid**: `VisualElement` (Flex-wrap: wrap 사용)
- **Block**: 10x10 px 크기의 `VisualElement`.
  - `.week-block`: 기본 스타일.
  - `.week-past`: 지난 주 스타일 (Low opacity).
  - `.week-current`: 현재 주 스타일 (Primary color border).
  - `.week-future`: 남은 주 스타일 (Border only).
  - `.week-milestone`: 기념일 스타일 (Custom color).

### 3.2. 성능 최적화 전략

- **배율(Scale) 기반 조작**: 5200개의 블록 크기를 일일이 바꾸는 대신, 그리드 부모(`LifeWeeklyGrid`)의 `transform.scale` 조작하여 GPU 가속 활용.
- **컨테이너 동적 계산**: 스케일링된 그리드가 스크롤 영역을 올바르게 차지하고 중앙 정렬되도록 컨테이너 크기 정확히 계산.

## 4. 주요 로직

### 4.1. 주차 계산

- **그리드 매핑**: 1년을 52주로 고정하여 시각적 직관성 확보.
- **현재 주차 계산**:

```csharp
int totalWeeks = (int)((now - birthDate).TotalDays / 7);
```

### 4.2. UI 구성

- **2단 메뉴바**: 옵션 증가에 따라 '제목/강조 설정'과 '수치/생일 설정' 분리하여 가독성 확보.
- **중앙 정렬**: `transform-origin: center`와 컨테이너 크기 조절 조합으로 어떤 배율에서도 그리드 중앙 위치.

## 5. 최종 구현 사양

1. **Highlighting**: 생일 기준 1년, 달력 기준 1월 1일, 10년 주기 마커 지원.
2. **Zoom**: 5px~50px 범위의 부드러운 확대/축소 지원.
3. **Tooltip**: 각 주차의 나이와 날짜 범위를 즉시 표시.
