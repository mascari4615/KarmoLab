# Planner Feature Event Flow

## 1. 개요

Planner Feature의 시간표(TimeTable) 시각형성 및 드래그 앤 드롭 일정 생성/수정 기능 제공.
주요 동작 흐름과 이벤트 처리 로직 정리.

## 2. 주요 클래스 및 역할

- **PlannerFeature.cs**: 메인 진입점. 초기화(`Initialize`) 및 상단 설정바 UI(`_uiZoom` 등) 이벤트 처리.
- **PlannerFeature.Schedule.cs**: 시간표 렌더링(`RefreshSchedule`) 및 드래그/리사이즈 입력 처리.
- **PlannerFeature.Dialogs.cs**: 상세 팝업(`DetailPopup`), 수정 모달(`EditDialog`), 반복 일정(`Recurrence`) 로직 처리.

## 3. 이벤트 플로우

### 3.1. 일정 생성 (Drag & Drop)

1. **PointerDown (`OnRulerPointerDown` in Schedule.cs)**
   - 타임 룰러 빈 공간 클릭.
   - `_dragMode = DragMode.Create`.
   - 시작 시간(`_dragStartY`) 기록, 고스트 블럭(`_ghostBlock`) 표시.
2. **PointerMove (`OnRulerPointerMove`)**
   - 드래그 중 고스트 블럭 높이 조절.
   - `_pixelsPerMinute` 및 `_snapInterval` 반영.
3. **PointerUp (`OnRulerPointerUp`)**
   - 드래그 종료.
   - `CreateBlock` 호출 -> `TimeBlock` 데이터 생성 및 `Data.TimeBlocks`에 추가.
   - `SaveData()` -> `RefreshSchedule()` (UI 갱신).

### 3.2. 일정 상세 보기 (Click)

1. **Block Click (`RegisterCallback<ClickEvent>`)**
   - `RefreshSchedule`에서 블럭 생성 시 클릭 이벤트 바인딩.
   - 클릭 시 `ShowDetailPopup(block)` 호출 (Dialogs.cs).
2. **ShowDetailPopup**
   - `_selectedBlock` 설정.
   - UI에 제목, 시간, 설명 표시.
   - **팝업 위치 설정**: `top = block.StartMinute * _pixelsPerMinute` (블럭 시작 시간 높이에 맞춤).

### 3.3. 일정 수정 (Edit)

1. **수정 모달 열기**
   - 상세 팝업의 [Edit] 버튼 클릭 -> `ShowEditDialog(block)`.
   - `DetailPopup` 닫기 -> `EditOverlay` (`EditDialogOverlay`) 표시.
   - 블럭 데이터(제목, 설명, 태그, 반복 규칙 등)를 UI 인풋 필드에 로드.
   - `_tempEditTags` 리스트에 태그 복사.
2. **데이터 수정 및 저장**
   - 사용자가 제목, 색상, 태그 등을 수정.
   - [Save] 버튼 클릭 -> `OnSaveEdit`.
   - **데이터 반영**: UI 값들을 `_selectedBlock`에 덮어쓰기.
     - Title, Description, Time(Min), ColorIndex, Tags List, RecurrenceRule.
   - `SaveData()` -> `RefreshSchedule()` -> 모달 닫기.

### 3.4. 일정 삭제

1. **삭제 요청**
   - 상세 팝업 [Delete] 또는 수정 모달 [Delete] 버튼 클릭.
2. **반복 일정 확인**
   - 단순 블럭이면 바로 `IsDeleted = true`.
   - 반복 일정(`RecurrenceRule` 존재)이면 확인 팝업(`ShowRecurrencePopup`) 표시.
     - "This Event Only": `ExceptionDates`에 추가.
     - "All Future": 원본 블럭 `RecurrenceEnd` 수정.
3. **완료 처리**
   - `SaveData()` -> `RefreshSchedule()`.

## 4. 로직 디버깅 포인트

- **UI 바인딩 확인**: `InitializeDialogs`에서 이름(`EditDialogOverlay` 등)이 UXML과 일치하는지 확인.
- **위치 계산**: `ShowDetailPopup`에서 `top` 값이 `_pixelsPerMinute`에 따라 올바르게 계산되는지 로그 확인 (`[Planner] ShowDetailPopup...`).
- **데이터 저장**: `OnSaveEdit`에서 모든 필드(특히 태그, 반복)가 `_selectedBlock`에 제대로 할당되는지 로그 확인 (`[Planner] OnSaveEdit: ...`).
