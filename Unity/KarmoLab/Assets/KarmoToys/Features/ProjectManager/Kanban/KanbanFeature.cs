using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Main;
using KarmoToys.Common.Data;
using KarmoToys.Core;

namespace KarmoToys.Features.ProjectManager.Kanban
{
	[AddComponentMenu("KarmoToys/Features/KanbanFeature")]
	public class KanbanFeature : ProjectViewBase
	{
		public override string FeatureName => "Kanban";
		public override string TabButtonName => string.Empty;

		private VisualElement _kanbanView; // Found from root
		private ScrollView _listTodo;
		private ScrollView _listDoing;
		private ScrollView _listDone;

		private Label _headerTodo;
		private Label _headerDoing;
		private Label _headerDone;

		private Button _btnAddTodo;
		private Button _btnAddDoing;
		private Button _btnAddDone;

		// Drag State
		private ProjectItemData _draggingItem;
		private VisualElement _ghostIcon;
		private Vector2 _dragStartPos;
		private bool _isDragging;

		public override void Initialize(VisualElement root)
		{
			ViewContainer = root;
			_kanbanView = root.Q("KanbanView");

			_listTodo = root.Q<ScrollView>("ListTodo");
			_listDoing = root.Q<ScrollView>("ListDoing");
			_listDone = root.Q<ScrollView>("ListDone");

			_headerTodo = root.Q<Label>("HeaderTodo");
			_headerDoing = root.Q<Label>("HeaderDoing");
			_headerDone = root.Q<Label>("HeaderDone");

			_btnAddTodo = root.Q<Button>("BtnAddTodo");
			_btnAddDoing = root.Q<Button>("BtnAddDoing");
			_btnAddDone = root.Q<Button>("BtnAddDone");

			_btnAddTodo.clicked += () => AddNewItemToColumn(MemoStatus.Todo);
			_btnAddDoing.clicked += () => AddNewItemToColumn(MemoStatus.Doing);
			_btnAddDone.clicked += () => AddNewItemToColumn(MemoStatus.Done);

			Refresh();
		}

		public override void Refresh()
		{
			if (_listTodo == null) return;
			_listTodo.Clear();
			_listDoing.Clear();
			_listDone.Clear();

			List<ProjectItemData> items = KarmoToysApp.Instance.Data.ProjectItems;
			int countTodo = 0;
			int countDoing = 0;
			int countDone = 0;

			foreach (ProjectItemData item in items)
			{
				VisualElement card = CreateKanbanCard(item);
				switch (item.Status)
				{
					case MemoStatus.Todo:
						_listTodo.Add(card);
						countTodo++;
						break;
					case MemoStatus.Doing:
						_listDoing.Add(card);
						countDoing++;
						break;
					case MemoStatus.Done:
						_listDone.Add(card);
						countDone++;
						break;
				}
			}

			_headerTodo.text = $"TODO ({countTodo})";
			_headerDoing.text = $"DOING ({countDoing})";
			_headerDone.text = $"DONE ({countDone})";

			AddEmptyState(_listTodo, countTodo);
			AddEmptyState(_listDoing, countDoing);
			AddEmptyState(_listDone, countDone);
		}

		private void AddEmptyState(ScrollView list, int count)
		{
			if (count == 0)
			{
				Label empty = new Label("(Empty)")
				{
					style =
					{
						opacity = 0.5f,
						fontSize = 12,
						unityTextAlign = TextAnchor.MiddleCenter,
						marginTop = 10
					}
				};
				list.Add(empty);
			}
		}

		private void AddNewItemToColumn(MemoStatus status)
		{
			ProjectItemData newItem = new ProjectItemData("New Task", string.Empty) { Status = status };
			KarmoToysApp.Instance.Data.ProjectItems.Add(newItem);
			KarmoToysApp.Instance.SaveData();
			Refresh();
			KarmoToysApp.Toast.Show($"Added to {status} 📝");
			ProjectManagerFeature.Modal.Open(newItem);
		}

		private VisualElement CreateKanbanCard(ProjectItemData item)
		{
			VisualElement card = new VisualElement();
			card.AddToClassList("kanban-item");

			Label title = new Label(item.Title);
			title.AddToClassList("item-title");

			VisualElement strip = new VisualElement();
			strip.AddToClassList("priority-strip");
			strip.AddToClassList(item.Priority == Priority.High ? "strip-high" : item.Priority == Priority.Low ? "strip-low" : "strip-medium");

			VisualElement tagsContainer = new VisualElement();
			tagsContainer.AddToClassList("tags-container");
			foreach (string tag in item.Tags ?? new List<string>())
			{
				if (string.IsNullOrWhiteSpace(tag)) continue;
				Label tagChip = new Label(tag);
				tagChip.AddToClassList("tag-chip");
				tagsContainer.Add(tagChip);
			}

			Button btnEdit = new Button(() => ProjectManagerFeature.Modal.Open(item))
			{
				text = "✎",
				style =
				{
					position = Position.Absolute,
					right = 5,
					top = 5,
					width = 20,
					height = 20,
					fontSize = 10,
					borderTopWidth = 0,
					borderBottomWidth = 0,
					borderLeftWidth = 0,
					borderRightWidth = 0
				}
			};
			btnEdit.style.backgroundColor = new StyleColor(new Color(0, 0, 0, 0.1f));

			VisualElement meta = new VisualElement();
			meta.AddToClassList("item-meta");
			Label typeBadge = new Label(item.Type.ToString());
			typeBadge.AddToClassList("badge");
			typeBadge.AddToClassList($"badge-{item.Type.ToString().ToLower()}");
			meta.Add(typeBadge);

			if (item.DueDate.HasValue)
			{
				Label dateLabel = new Label(item.DueDate.Value.ToString("MM/dd"))
				{
					style =
					{
						fontSize = 10,
						unityFontStyleAndWeight = FontStyle.Italic,
						marginLeft = 5,
						color = item.DueDate.Value < System.DateTime.Now.Date ? Color.red : Color.gray
					}
				};
				meta.Add(dateLabel);
			}

			card.Add(strip);
			card.Add(title);
			card.Add(tagsContainer);
			card.Add(meta);
			card.Add(btnEdit);

			// Drag & Drop
			card.RegisterCallback<PointerDownEvent>(evt =>
			{
				if (evt.button == 1)
				{
					evt.StopPropagation();
					ProjectManagerFeature.ContextMenu.Show(evt.position, item);
					return;
				}
				if (evt.button != 0) return;
				_isDragging = false;
				_dragStartPos = evt.position;
				card.CapturePointer(evt.pointerId);
			});

			card.RegisterCallback<PointerMoveEvent>(evt =>
			{
				if (!card.HasPointerCapture(evt.pointerId)) return;
				if (!_isDragging && Vector2.Distance(_dragStartPos, evt.position) > 5f)
				{
					_isDragging = true;
					_draggingItem = item;
					if (_ghostIcon == null)
					{
						_ghostIcon = new VisualElement();
						_ghostIcon.AddToClassList("kanban-item");
						_ghostIcon.style.position = Position.Absolute;
						_ghostIcon.style.width = card.resolvedStyle.width;
						_ghostIcon.style.height = card.resolvedStyle.height;
						_ghostIcon.style.opacity = 0.6f;
						_ghostIcon.pickingMode = PickingMode.Ignore;
						_ghostIcon.Add(new Label(item.Title));

						// Add ghost to ViewContainer (Parent of KanbanView)
						if (ViewContainer != null)
						{
							ViewContainer.Add(_ghostIcon);
						}
					}
				}
				if (_isDragging && _ghostIcon != null)
				{
					Vector2 localPos = ViewContainer.WorldToLocal(evt.position);
					_ghostIcon.style.left = localPos.x - (_ghostIcon.resolvedStyle.width / 2);
					_ghostIcon.style.top = localPos.y - (_ghostIcon.resolvedStyle.height / 2);
				}
			});

			card.RegisterCallback<PointerUpEvent>(evt =>
			{
				if (card.HasPointerCapture(evt.pointerId))
				{
					card.ReleasePointer(evt.pointerId);
					if (_isDragging)
					{
						VisualElement target = _kanbanView.panel.Pick(evt.position);
						VisualElement column = GetColumnFromTarget(target);
						if (column != null)
						{
							MemoStatus newStatus = GetStatusFromColumn(column.name);
							if (item.Status != newStatus)
							{
								item.Status = newStatus;
								KarmoToysApp.Instance.SaveData();
								KarmoToysApp.Toast.Show($"Moved to {newStatus} 📦");
							}
						}
						_ghostIcon?.RemoveFromHierarchy();
						_ghostIcon = null;
						_isDragging = false;

						Refresh();
					}
					else if (evt.clickCount == 2) ProjectManagerFeature.Modal.Open(item);
				}
			});

			return card;
		}

		private VisualElement GetColumnFromTarget(VisualElement target)
		{
			VisualElement current = target;
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
