# Task List

Summary: KarmoToys 프로젝트의 주요 작업 목록 및 진행 상태.

- [x] **Phase 2: 익숙한 기능의 재구성 (Core Views & Refinement)**
  - [x] Create `ProjectManager` feature folder and files
  - [x] Implement Table View (Project Items List)
  - [x] Implement Kanban View (Status-based Columns)
  - [x] Implement View Switcher (Tab logic between Table/Kanban)
    - [x] **Refinements & Bug Fixes**
    - [x] Remove Legacy Features (`QuestBoard`, `Note`)
    - [x] Fix Compile Errors (Quest/Note references)
- [x] **Refine ProjectManager** <!-- id: 4 -->
  - [x] Implement Ghost Element for Dragging
  - [x] Improve Drop Hit Testing vs Kanban Columns
  - [x] **Refactoring**: Split `ProjectManagerFeature` into Partials (Table/Kanban)
    - [x] **Table View**: Sorting & Filtering
    - [x] **Table View**: Inline Editing (Status/Priority)
    - [x] **Kanban View**: Quick Add Button per Column
    - [x] **General**: Context Menu (Right Click)
  - [x] **Refactoring**: Convert Partials to Feature Classes (Table/Kanban)
  - [x] **Kanban View**: Column Item Counts & UI Polish
  - [x] **Data**: Add `DueDate` & `Tags` (Planner Integration Prep)
  - [x] **UI Polish**: Sidebar Layout, Ghost Scrollbar, Theme Tokens
    - [x] **Hotfix**: Resolved StyleVariableResolver NRE (Cleaned up UXML imports & Inline styles)
  
- [/] **Phase 3: 시각적 자유도 (Whiteboard)** <!-- id: 5 -->
  - [x] **Infrastructure**: Pan/Zoom Manipulator & Canvas View
  - [ ] **Node System**: Draggable Notes/Cards
  - [ ] **Integration**: Link with Project Data
  
- [ ] Phase 4: 시간과 계획 (Timeline)
