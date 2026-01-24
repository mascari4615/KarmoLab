using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager.Kanban
{
	public class ProjectKanbanController
	{
		private readonly ProjectManagerFeature _owner;
		private readonly VisualElement _root;
		private readonly VisualElement _mainViewContainer;

		private ScrollView _listTodo, _listDoing, _listDone;
		private Label _headerTodo, _headerDoing, _headerDone;
		private Button _btnAddTodo, _btnAddDoing, _btnAddDone;

		// Drag State
		private ProjectItemData _draggingItem;
		private VisualElement _ghostIcon;
		private Vector2 _dragStartPos;
		private bool _isDragging;

		public ProjectKanbanController(ProjectManagerFeature owner, VisualElement root, VisualElement mainViewContainer)
		{
			_owner = owner;
			_root = root;
			_mainViewContainer = mainViewContainer;
			Initialize();
		}

		private void Initialize()
		{
			_listTodo = _root.Q<ScrollView>("ListTodo");
			_listDoing = _root.Q<ScrollView>("ListDoing");
			_listDone = _root.Q<ScrollView>("ListDone");

			_headerTodo = _root.Q<Label>("HeaderTodo");
			_headerDoing = _root.Q<Label>("HeaderDoing");
			_headerDone = _root.Q<Label>("HeaderDone");

			_btnAddTodo = _root.Q<Button>("BtnAddTodo");
			_btnAddDoing = _root.Q<Button>("BtnAddDoing");
			_btnAddDone = _root.Q<Button>("BtnAddDone");

			if (_btnAddTodo != null) _btnAddTodo.clicked += () => AddNewItemToColumn(MemoStatus.Todo);
			if (_btnAddDoing != null) _btnAddDoing.clicked += () => AddNewItemToColumn(MemoStatus.Doing);
			if (_btnAddDone != null) _btnAddDone.clicked += () => AddNewItemToColumn(MemoStatus.Done);
		}

		public void Refresh()
		{
			if (_listTodo == null) return;
			_listTodo.Clear();
			_listDoing.Clear();
			_listDone.Clear();

			List<ProjectItemData> items = KarmoToysApp.Instance.Data.ProjectItems;
			int countTodo = 0, countDoing = 0, countDone = 0;

			foreach (var item in items)
			{
				var card = CreateKanbanCard(item);
				switch (item.Status)
				{
					case MemoStatus.Todo: _listTodo.Add(card); countTodo++; break;
					case MemoStatus.Doing: _listDoing.Add(card); countDoing++; break;
					case MemoStatus.Done: _listDone.Add(card); countDone++; break;
				}
			}

			if (_headerTodo != null) _headerTodo.text = $"TODO ({countTodo})";
			if (_headerDoing != null) _headerDoing.text = $"DOING ({countDoing})";
			if (_headerDone != null) _headerDone.text = $"DONE ({countDone})";

			AddEmptyState(_listTodo, countTodo);
			AddEmptyState(_listDoing, countDoing);
			AddEmptyState(_listDone, countDone);
		}

		private void AddEmptyState(ScrollView list, int count)
		{
			if (count == 0)
			{
				var empty = new Label("(Empty)") { style = { opacity = 0.5f, fontSize = 12, unityTextAlign = TextAnchor.MiddleCenter, marginTop = 10 } };
				list.Add(empty);
			}
		}

		private void AddNewItemToColumn(MemoStatus status)
		{
			var newItem = new ProjectItemData("New Task", string.Empty) { Status = status };
			KarmoToysApp.Instance.Data.ProjectItems.Add(newItem);
			KarmoToysApp.Instance.SaveData();
			_owner.RefreshViews();
			KarmoToysApp.Toast.Show($"Added to {status} 📝");
			_owner.OpenModal(newItem);
		}

		private VisualElement CreateKanbanCard(ProjectItemData item)
		{
			var card = new VisualElement();
			card.AddToClassList("kanban-item");

			var title = new Label(item.Title);
			title.AddToClassList("item-title");

			var strip = new VisualElement();
			strip.AddToClassList("priority-strip");
			strip.AddToClassList(item.Priority == Priority.High ? "strip-high" : item.Priority == Priority.Low ? "strip-low" : "strip-medium");

			var tagsContainer = new VisualElement();
			tagsContainer.AddToClassList("tags-container");
			foreach (var tag in item.Tags ?? new List<string>())
			{
				if (string.IsNullOrWhiteSpace(tag)) continue;
				var tagChip = new Label(tag);
				tagChip.AddToClassList("tag-chip");
				tagsContainer.Add(tagChip);
			}

			var btnEdit = new Button(() => _owner.OpenModal(item)) { text = "✎", style = { position = Position.Absolute, right = 5, top = 5, width = 20, height = 20, fontSize = 10, borderTopWidth = 0, borderBottomWidth = 0, borderLeftWidth = 0, borderRightWidth = 0 } };
			btnEdit.style.backgroundColor = new StyleColor(new Color(0, 0, 0, 0.1f));

			var meta = new VisualElement();
			meta.AddToClassList("item-meta");
			var typeBadge = new Label(item.Type.ToString());
			typeBadge.AddToClassList("badge");
			typeBadge.AddToClassList($"badge-{item.Type.ToString().ToLower()}");
			meta.Add(typeBadge);

			if (item.DueDate.HasValue)
			{
				var dateLabel = new Label(item.DueDate.Value.ToString("MM/dd")) { style = { fontSize = 10, unityFontStyleAndWeight = FontStyle.Italic, marginLeft = 5, color = item.DueDate.Value < System.DateTime.Now.Date ? Color.red : Color.gray } };
				meta.Add(dateLabel);
			}

			card.Add(strip);
			card.Add(title);
			card.Add(tagsContainer);
			card.Add(meta);
			card.Add(btnEdit);

			// Drag & Drop
			card.RegisterCallback<PointerDownEvent>(evt => {
				if (evt.button == 1) {
					evt.StopPropagation();
					_owner.ShowContextMenu(evt.position, item);
					return;
				}
				if (evt.button != 0) return;
				_isDragging = false;
				_dragStartPos = evt.position;
				card.CapturePointer(evt.pointerId);
			});

			card.RegisterCallback<PointerMoveEvent>(evt => {
				if (!card.HasPointerCapture(evt.pointerId)) return;
				if (!_isDragging && Vector2.Distance(_dragStartPos, evt.position) > 5f) {
					_isDragging = true;
					_draggingItem = item;
					if (_ghostIcon == null) {
						_ghostIcon = new VisualElement();
						_ghostIcon.AddToClassList("kanban-item");
						_ghostIcon.style.position = Position.Absolute;
						_ghostIcon.style.width = card.resolvedStyle.width;
						_ghostIcon.style.height = card.resolvedStyle.height;
						_ghostIcon.style.opacity = 0.6f;
						_ghostIcon.pickingMode = PickingMode.Ignore;
						_ghostIcon.Add(new Label(item.Title));
						_mainViewContainer.Add(_ghostIcon);
					}
				}
				if (_isDragging && _ghostIcon != null) {
					Vector2 localPos = _mainViewContainer.WorldToLocal(evt.position);
					_ghostIcon.style.left = localPos.x - (_ghostIcon.resolvedStyle.width / 2);
					_ghostIcon.style.top = localPos.y - (_ghostIcon.resolvedStyle.height / 2);
				}
			});

			card.RegisterCallback<PointerUpEvent>(evt => {
				if (card.HasPointerCapture(evt.pointerId)) {
					card.ReleasePointer(evt.pointerId);
					if (_isDragging) {
						var target = _root.panel.Pick(evt.position);
						var column = GetColumnFromTarget(target);
						if (column != null) {
							var newStatus = GetStatusFromColumn(column.name);
							if (item.Status != newStatus) {
								item.Status = newStatus;
								KarmoToysApp.Instance.SaveData();
								KarmoToysApp.Toast.Show($"Moved to {newStatus} 📦");
							}
						}
						_ghostIcon?.RemoveFromHierarchy();
						_ghostIcon = null;
						_isDragging = false;
						Refresh();
					} else if (evt.clickCount == 2) _owner.OpenModal(item);
				}
			});

			return card;
		}

		private VisualElement GetColumnFromTarget(VisualElement target)
		{
			var current = target;
			while (current != null)
			{
				if (current.ClassListContains("kanban-column") || current.name == "ColTodo" || current.name == "ColDoing" || current.name == "ColDone")
					return current;
				current = current.parent;
			}
			return null;
		}

		private MemoStatus GetStatusFromColumn(string columnName)
		{
			if (columnName.Contains("Todo")) return MemoStatus.Todo;
			if (columnName.Contains("Doing")) return MemoStatus.Doing;
			if (columnName.Contains("Done")) return MemoStatus.Done;
			return MemoStatus.Todo;
		}
	}
}
