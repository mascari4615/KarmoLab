using System;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Common;
using KarmoToys.Common.Data;
using KarmoToys.Main;

namespace KarmoToys.Features.ProjectManager
{
	[AddComponentMenu("KarmoLab/Features/ProjectManager")]
	public partial class ProjectManagerFeature : FeatureBase
	{
		public override string FeatureName => Define.FeatureProjectManager;
		public override string TabButtonName => Define.TabProject;

		private VisualElement _tableView, _kanbanView, _timelineWrapper;
		private Button _btnViewTable, _btnViewKanban, _btnViewTimeline;
		private ScrollView _tableList;
		private ScrollView _listTodo, _listDoing, _listDone;
		private TextField _inputNewItem;
		private Button _btnAddNewItem;

		// Table Toolbar & Headers
		private TextField _searchField;
		private Label _headerTitle, _headerStatus, _headerPriority, _headerType, _headerDate;

		// Kanban Headers
		private Label _headerTodo, _headerDoing, _headerDone;
		private Button _btnAddTodo, _btnAddDoing, _btnAddDone;

		// Modal UI
		private VisualElement _detailModal;
		private TextField _editTitle, _editContent, _editDueDate, _editTags;
		private EnumField _editType, _editStatus, _editPriority;
		private Button _btnSaveItem, _btnDeleteItem, _btnCloseModal;
		private ProjectItemData _selectedItem;

		public override void Initialize(VisualElement root)
		{
			ViewContainer = root.Q("ViewProjectManager");
			if (ViewContainer == null) return;

			// View Switcher
			_tableView = ViewContainer.Q("TableView");
			_kanbanView = ViewContainer.Q("KanbanView");
            _timelineWrapper = ViewContainer.Q("TimelineWrapper");

			_btnViewTable = ViewContainer.Q<Button>("BtnViewTable");
			_btnViewKanban = ViewContainer.Q<Button>("BtnViewKanban");
            _btnViewTimeline = ViewContainer.Q<Button>("BtnViewTimeline");

			_btnViewTable.clicked += () => SwitchView(ViewType.Table);
			_btnViewKanban.clicked += () => SwitchView(ViewType.Kanban);
            _btnViewTimeline.clicked += () => SwitchView(ViewType.Timeline);

			// Table View
			_tableList = ViewContainer.Q<ScrollView>("ProjectItemList");
			_inputNewItem = ViewContainer.Q<TextField>("InputNewItem");
			_btnAddNewItem = ViewContainer.Q<Button>("BtnAddNewItem");

			// Table Toolbar
			_searchField = ViewContainer.Q<TextField>("SearchField");
			if (_searchField != null) _searchField.RegisterValueChangedCallback(evt => RefreshTable()); // Real-time search

			// Table Headers
			_headerTitle = ViewContainer.Q<Label>("HeaderTitle");
			_headerStatus = ViewContainer.Q<Label>("HeaderStatus");
			_headerPriority = ViewContainer.Q<Label>("HeaderPriority");
			_headerType = ViewContainer.Q<Label>("HeaderType");
			_headerDate = ViewContainer.Q<Label>("HeaderDate");

			_headerTitle?.RegisterCallback<ClickEvent>(evt => ToggleSort("Title"));
			_headerStatus?.RegisterCallback<ClickEvent>(evt => ToggleSort("Status"));
			_headerPriority?.RegisterCallback<ClickEvent>(evt => ToggleSort("Priority"));
			_headerType?.RegisterCallback<ClickEvent>(evt => ToggleSort("Type"));
			_headerDate?.RegisterCallback<ClickEvent>(evt => ToggleSort("Due"));

			_btnAddNewItem.clicked += AddNewItem;
			_inputNewItem.RegisterCallback<KeyDownEvent>(evt => { if (evt.keyCode == KeyCode.Return) AddNewItem(); });

			// Kanban View
			_listTodo = ViewContainer.Q<ScrollView>("ListTodo");
			_listDoing = ViewContainer.Q<ScrollView>("ListDoing");
			_listDone = ViewContainer.Q<ScrollView>("ListDone");
			_headerTodo = ViewContainer.Q<Label>("HeaderTodo");
			_headerDoing = ViewContainer.Q<Label>("HeaderDoing");
			_headerDone = ViewContainer.Q<Label>("HeaderDone");

			_btnAddTodo = ViewContainer.Q<Button>("BtnAddTodo");
			_btnAddDoing = ViewContainer.Q<Button>("BtnAddDoing");
			_btnAddDone = ViewContainer.Q<Button>("BtnAddDone");

			_btnAddTodo.clicked += () => AddNewItemToColumn(MemoStatus.Todo);
			_btnAddDoing.clicked += () => AddNewItemToColumn(MemoStatus.Doing);
			_btnAddDone.clicked += () => AddNewItemToColumn(MemoStatus.Done);

			// Context Menu
			_contextMenu = ViewContainer.Q("ContextMenu");
			_btnCtxTodo = ViewContainer.Q<Button>("BtnCtxTodo");
			_btnCtxDoing = ViewContainer.Q<Button>("BtnCtxDoing");
			_btnCtxDone = ViewContainer.Q<Button>("BtnCtxDone");
			_btnCtxArchive = ViewContainer.Q<Button>("BtnCtxArchive");
			_btnCtxDelete = ViewContainer.Q<Button>("BtnCtxDelete");

			_btnCtxTodo.clicked += () => OnContextAction("todo");
			_btnCtxDoing.clicked += () => OnContextAction("doing");
			_btnCtxDone.clicked += () => OnContextAction("done");
			_btnCtxArchive.clicked += () => OnContextAction("archive");
			_btnCtxDelete.clicked += () => OnContextAction("delete");

			// Detail Modal
			_detailModal = ViewContainer.Q("ProjectDetailModal");
			_editTitle = _detailModal.Q<TextField>("EditTitle");
			_editContent = _detailModal.Q<TextField>("EditContent");
			_editType = _detailModal.Q<EnumField>("EditType");
			_editStatus = _detailModal.Q<EnumField>("EditStatus");
			_editPriority = _detailModal.Q<EnumField>("EditPriority");
			_editDueDate = _detailModal.Q<TextField>("EditDueDate");
			_editTags = _detailModal.Q<TextField>("EditTags");
			_btnSaveItem = _detailModal.Q<Button>("BtnSaveProjectItem");
			_btnDeleteItem = _detailModal.Q<Button>("BtnDeleteProjectItem");
			_btnCloseModal = _detailModal.Q<Button>("BtnCloseModal");

			_btnSaveItem.clicked += SaveSelectedItem;
			_btnDeleteItem.clicked += DeleteSelectedItem;
			_btnCloseModal.clicked += CloseModal;

			// Initialize EnumFields
			_editType.Init(MemoType.Task);
			_editStatus.Init(MemoStatus.Todo);
			_editPriority.Init(Priority.Medium);

			// Close Context Menu on click outside
			ViewContainer.RegisterCallback<PointerDownEvent>(evt =>
			{
				// If clicking outside context menu, close it
				if (_contextMenu.style.display == DisplayStyle.Flex && !_contextMenu.ContainsPoint(evt.localPosition))
				{
					HideContextMenu();
				}
			}, TrickleDown.TrickleDown);
		}

		// Context Menu Logic
		private VisualElement _contextMenu;
		private Button _btnCtxTodo, _btnCtxDoing, _btnCtxDone, _btnCtxArchive, _btnCtxDelete;
		private ProjectItemData _contextItem;

		public void ShowContextMenu(Vector2 mousePosition, ProjectItemData item)
		{
			_contextItem = item;
			_contextMenu.style.display = DisplayStyle.Flex;

			// Position menu
			Vector2 localPos = ViewContainer.WorldToLocal(mousePosition);
			_contextMenu.style.left = localPos.x;
			_contextMenu.style.top = localPos.y;

			// Bring to front
			_contextMenu.BringToFront();
		}

		private void HideContextMenu()
		{
			_contextMenu.style.display = DisplayStyle.None;
			_contextItem = null;
		}

		private void OnContextAction(string action)
		{
			if (_contextItem == null) return;

			switch (action)
			{
				case "todo": _contextItem.Status = MemoStatus.Todo; break;
				case "doing": _contextItem.Status = MemoStatus.Doing; break;
				case "done": _contextItem.Status = MemoStatus.Done; break;
				case "archive": _contextItem.Status = MemoStatus.Archive; break;
				case "delete":
					KarmoToysApp.Instance.Data.ProjectItems.Remove(_contextItem);
					KarmoToysApp.Toast.Show("Item deleted 🗑️");
					break;
			}

			if (action != "delete") KarmoToysApp.Instance.SaveData();

			RefreshViews();
			HideContextMenu();
		}

		public override void OnSelect()
		{
			base.OnSelect();
			RefreshViews();
		}

        enum ViewType { Table, Kanban, Timeline }

		private void SwitchView(ViewType type)
		{
			_tableView.style.display = type == ViewType.Table ? DisplayStyle.Flex : DisplayStyle.None;
			_kanbanView.style.display = type == ViewType.Kanban ? DisplayStyle.Flex : DisplayStyle.None;
            if (_timelineWrapper != null) 
                _timelineWrapper.style.display = type == ViewType.Timeline ? DisplayStyle.Flex : DisplayStyle.None;

			_btnViewTable.EnableInClassList("selected", type == ViewType.Table);
			_btnViewKanban.EnableInClassList("selected", type == ViewType.Kanban);
            if (_btnViewTimeline != null)
                _btnViewTimeline.EnableInClassList("selected", type == ViewType.Timeline);

			RefreshViews();
		}

		private void RefreshViews()
		{
			if (_tableView.resolvedStyle.display == DisplayStyle.Flex) RefreshTable();
			else if (_kanbanView.resolvedStyle.display == DisplayStyle.Flex) RefreshKanban();
            // Timeline refresh is handled by TimelineFeature's own logic implicitly, 
            // or we can explicitly call it if we have reference.
            // Currently setup: TimelineFeature is separate.
		}
	}
}
