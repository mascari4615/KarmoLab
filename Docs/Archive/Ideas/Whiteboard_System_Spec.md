# 🗒️ 통합 메모 화이트보드 (Whiteboard) 상세 설계서

기존 `QuestBoard`와 `Note` 기능을 통합하여, 시각적인 자유도와 체계적인 관리를 동시에 제공하는 시스템임.

## 1. 핵심 개념: "One Data, Multi-View"

모든 메모는 동일한 데이터 구조(`BoardMemoData`)를 가지며, 사용자의 목적에 따라 세 가지 형태로 보여짐.

1. **화이트보드 (Whiteboard)**: 자유로운 위치에 포스트잇을 붙이고 드래그하는 뷰.
2. **테이블 (Table)**: 엑셀처럼 한눈에 데이터를 파악하고 정렬/검색하는 뷰.
3. **칸반 (Kanban)**: Todo -> Doing -> Done 흐름에 따라 상태를 관리하는 뷰.

## 2. 데이터 구조 (Data Model)

```csharp
public enum MemoType { Task, Concept, Secret, Question }
public enum MemoStatus { Todo, Doing, Done, Archive }

[Serializable]
public class BoardMemoData
{
    public string Id;
    public string Title;          // 제목 (포스트잇 상단)
    public string Content;        // 상세 내용
    public MemoType Type;         // 타입 (기존 카테고리/노트 구분)
    public MemoStatus Status;     // 상태 (칸반용)
    
    // 외형 및 레이아웃
    public Vector2 Position;      // 화이트보드 상의 좌표 (X, Y)
    public int ColorIndex;        // 테마 색상 번호
    public float Angle;           // 회전값 (살짝 기울어진 포스트잇 효과)

    public List<string> Tags;     // 태그 (필터링용)
    public long CreatedAtTicks;   // 생성 일시
}
```

## 3. 뷰 별 상세 설계

### 🛠️ 화이트보드 뷰 (Whiteboard View)

- **구현**: `VisualElement`에 `PointerManipulator`를 부착하여 런타임 드래그 구현.
- **특징**:
  - 마우스 휠로 줌 인/아웃(Zoom) 및 팬(Pan) 지원.
  - 포스트잇끼리 겹칠 때 `pickingMode` 제어.
  - 빈 곳을 더블 클릭하여 즉시 새 메모 생성.

### 📊 테이블 뷰 (Table View)

- **구현**: UI Toolkit의 `MultiColumnListView` 활용.
- **컬럼**: 제목, 타입, 상태, 생성일, 태그.
- **기능**: 각 컬럼별 오름차순/내림차순 정렬 및 타입별 필터링.

### 📋 칸반 뷰 (Kanban View)

- **구현**: 3개의 가로형 `ScrollView` (또는 `ListView`) 배치.
- **기능**: 드래그 앤 드롭으로 메모를 옆 컬럼으로 이동시키면 `Status` 데이터가 즉시 반영됨.

## 4. 기술적 구현 방안 (Unity UI Toolkit)

- **패턴**: **MVP (Model-View-Presenter)** 적용.
  - `Model`: `List<BoardMemoData>`
  - `View`: `WhiteboardView.uxml`, `TableView.uxml` 등
  - `Presenter`: `WhiteboardFeature.cs` (데이터 로드 및 뷰 전환 제어)
- **드래그 최적화**:
  - 드래그 종료 시에만 `SaveData()` 호출하여 파일 입출력 부하 감소.
  - 데이터가 많을 경우 화이트보드 밖의 메모는 렌더링을 끄는 '좌표 기반 컬링' 적용 가능.

## 5. 단계별 개발 로드맵

1. **Phase 1**: 통합 데이터 모델 수립 및 기존 `Quest/Note` 데이터 마이그레이션 도구 작성.
2. **Phase 2**: 기본 화이트보드 드래그 인터랙션 구현.
3. **Phase 3**: 테이블 및 칸반 뷰 전환 시스템 구축.
4. **Phase 4**: 줌/팬 및 검색/필터링 고도화.
