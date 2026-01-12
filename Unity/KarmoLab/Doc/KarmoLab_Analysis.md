# KarmoLab Project Analysis

## 1. 개요
- **Engine**: Unity 6 (6000.0.32f1)
- **UI System**: UI Toolkit (UXML/USS)
- **Scripting**: C# 9.0+, MonoBehaviour(Controller) + Plain Class(Model)

## 2. 폴더 구조
- `Assets/Module/Planner/`: 플래너 모듈 핵심 파일 위치.
    - `PlannerView.uxml`: UI 레이아웃.
    - `PlannerStyle.uss`: UI 스타일 정의.
    - `PlannerController.cs` (Partial): 메인 컨트롤러.
    - `PlannerController.Schedule.cs`: 스케줄링 로직 (타임 블록 생성 등).

## 3. Planner UI 분석
### 구조
- 탭 기반 네비게이션 (`Dashboard`, `Tasks`, `Schedule`, `Secret`, `Tools`).
- `ViewSchedule` 탭에서 시간표 기능 수행.
- 스크립트(`PlannerController.Schedule.cs`)가 `TimeRulerContainer` 내에 `DayColumn`과 `TimeBlock`을 동적으로 생성함.

### TimeBlock 스타일링
- 기본 클래스: `.time-block`
- 내부 요소: `.time-block-time`, `.time-block-title`
- **문제점**: 블록 높이가 낮을 경우 기본 세로 배치(`flex-direction: column` default)로 인해 텍스트가 잘리거나 안 보임.
- **기존 대응**: `.time-block-compact` 클래스가 존재하지만, 동작 방식 확인 필요.

## 4. 개선 방향 (User Request)
- **Goal**: 작은 블록(높이가 낮은 블록)에서 제목과 시간을 한 줄로 배치하거나 시인성 개선.
- **Plan**:
    1. `PlannerController.Schedule.cs`에서 블록 높이에 따른 클래스 토글 로직 확인.
    2. `PlannerStyle.uss`에서 `.time-block-compact` 스타일을 수정하여 `flex-direction: row` 적용 및 폰트/여백 조정.
