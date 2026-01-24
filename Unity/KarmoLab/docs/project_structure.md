# KarmoToys UI Hierarchy (UXML Structure)

**Root Entry**: `MainView.uxml`
**Generated Date**: 2026-01-21

## 🌳 Visual Tree Structure

이 문서는 KarmoToys의 UI 계층 구조(Visual Tree)를 나타냅니다. 모든 기능은 이제 독립된 모듈로 분리되어 있습니다.

[MainView.uxml] (Root)
 ├── <Style> ThemeTokens.uss
 ├── <Style> MainStyle.uss
 │
 ├── Container (.root-container)
 │    ├── Sidebar Navigation (.nav-sidebar)
 │    │    ├── TabDashboard (New Top-level! 🏠)
 │    │    ├── TabProject 🚀
 │    │    ├── TabSchedule 📅
 │    │    └── ...
 │    │
 │    └── Content Area (.content-area)
 │         ├── Top Bar (.top-bar)
 │         │
 │         ├── <Instance> DashboardView
 │         │    └── [Features/Dashboard/DashboardView.uxml]
 │         │
 │         └── <Instance> ProjectManagerView 🚀
 │              ├── <Style> ProjectManagerStyle.uss
 │              │
 │              └── ViewProjectManager (.project-manager-container)
 │                   ├── Toolbar (.pm-toolbar)
 │                   │    ├── SearchField (Shared by Table)
 │                   │    └── ViewSwitcher (Table, Kanban, Timeline, Whiteboard)
 │                   │
 │                   ├── ProjectContent (.tab-content)
 │                   │    │
 │                   │    ├── TableWrapper
 │                   │    │    └── <Instance> TableView
 │                   │    │
 │                   │    ├── KanbanWrapper
 │                   │    │    └── <Instance> KanbanView
 │                   │    │
 │                   │    ├── TimelineWrapper
 │                   │    │    └── <Instance> TimelineView
 │                   │    │
 │                   │    └── WhiteboardWrapper
 │                   │         └── <Instance> WhiteboardView
 │                   │
 │                   ├── <Instance> ModalView (Shared Overlay)
 │                   │
 │                   └── ContextMenu (Shared Overlay)
 │
 └── ToastContainer

## 📂 Modular Structure (Final)

- **Features/ProjectManager/**
  - **Table/**: C# Controller, UXML, USS
  - **Kanban/**: C# Controller, UXML, USS
  - **Timeline/**: C# Controller, UXML, USS (Pre-existing)
  - **Whiteboard/**: C# Controller, UXML, USS, GridBackground.cs
  - **Modal/**: C# Controller, UXML, USS
  - **ProjectManagerFeature.cs**: Orchestrator (No partial!)
  - **ProjectManagerView.uxml**: Container Template
