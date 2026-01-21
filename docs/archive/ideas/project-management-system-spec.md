# 🚀 통합 프로젝트 매니저 (Project Manager) 상세 설계서

기존의 화이트보드 개념을 확장하여 JIRA나 GitHub Projects와 같이 전문적인 작업 관리가 가능한 통합 시스템으로 설계함.

## 1. 핵심 개념: "Full-Cycle Management"

단순한 메모를 넘어, 계획(Timeline) → 구상(Whiteboard) → 진행(Kanban) → 검토(Table)의 전체 사이클을 하나의 데이터로 관리함.

## 2. 확장 데이터 구조 (Extended Data Model)

```csharp
public enum Priority { Low, Medium, High, Critical }

[Serializable]
public class ProjectItemData
{
    public string Id;
    public string ParentId;       // 상위 작업(Epic/Task)과의 연동
    public string Title;
    public string Content;
    public MemoType Type;
    public MemoStatus Status;
    public Priority Priority;     // 우선순위 추가

    // 시간 관리 (Timeline 뷰 핵심)
    public long StartDateTicks;   // 시작일
    public long EndDateTicks;     // 마감일
    
    // 외형 및 레이아웃 (Whiteboard 뷰)
    public Vector2 Position;
    public float Angle;
    public int ColorIndex;

    public List<string> Tags;
    public long CreatedAtTicks;
}
```

## 3. 타임라인 뷰 상세 (Timeline View)

- **구현**:
  - Y축: 프로젝트 아이템 리스트 (ScrollView)
  - X축: 날짜 흐름 (Horizontal Scroll)
- **특징**:
  - **Gantt Chart 스타일**: 작업의 시작과 끝을 바(Bar) 형태로 시각화.
  - **의존성 표시**: 작업을 드래그하여 연결하면 Parent/Child 관계를 선으로 표시 (옵션).
  - **오늘 표시**: 현재 날짜를 관통하는 붉은 세로선 표시.

## 4. JIRA/GitHub 스타일의 특장점 반영

- **필터링 & 뷰 저장**: "내 작업만 보기", "이번 주 마감" 등의 필터를 걸고 해당 뷰를 저장하는 기능.
- **일괄 편집 (Bulk Action)**: 테이블 뷰에서 여러 아이템을 선택해 한 번에 상태를 변경하거나 마감일을 조정.
- **대시보드 위젯 연동**: 기존 `Dashboard` 기능과 연동하여 오늘 마감인 작업을 위젯으로 띄움.

## 5. 구현 우선순위 (Revised)

1. **Phase 1**: 기간(`StartDate`, `EndDate`) 정보가 포함된 확장 데이터 모델 수립.
2. **Phase 2**: 타임라인 기초 뷰(날짜별 바 배치) 및 화이트보드 드래그 구현.
3. **Phase 3**: 데이터 관계성(Parent/Child) 및 칸반/테이블 뷰 연동.
4. **Phase 4**: 필터 시스템 및 JIRA 스타일의 상세 편집 사이드바 구현.
