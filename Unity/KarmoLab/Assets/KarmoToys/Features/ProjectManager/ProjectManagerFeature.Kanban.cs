using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager
{
	public partial class ProjectManagerFeature
	{
		// Drag State
		private ProjectItemData _draggingItem;
		private VisualElement _ghostIcon;
		private Vector2 _dragStartPos;
		private bool _isDragging;

		private void RefreshKanban()
		{
			_listTodo.Clear();
			_listDoing.Clear();
			_listDone.Clear();

			List<ProjectItemData> items = KarmoToysApp.Instance.Data.ProjectItems;
			int countTodo = 0, countDoing = 0, countDone = 0;

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
					case MemoStatus.Archive: break;
				}
			}

			// Update Header Counts
			if (_headerTodo != null) _headerTodo.text = $"TODO ({countTodo})";
			if (_headerDoing != null) _headerDoing.text = $"DOING ({countDoing})";
			if (_headerDone != null) _headerDone.text = $"DONE ({countDone})";

			// Empty States
			AddEmptyState(_listTodo, countTodo);
			AddEmptyState(_listDoing, countDoing);
			AddEmptyState(_listDone, countDone);
		}

		private void AddEmptyState(ScrollView list, int count)
		{
			if (count == 0)
			{
				Label empty = new Label("(Empty)");
				empty.style.opacity = 0.5f;
				empty.style.fontSize = 12;
				empty.style.unityTextAlign = TextAnchor.MiddleCenter;
				empty.style.marginTop = 10;
				list.Add(empty);
			}
		}

		private void AddNewItemToColumn(MemoStatus status)
		{
			ProjectItemData newItem = new ProjectItemData("New Task", string.Empty);
			newItem.Status = status;
			KarmoToysApp.Instance.Data.ProjectItems.Add(newItem);

			KarmoToysApp.Instance.SaveData();
			RefreshViews();
			KarmoToysApp.Toast.Show($"Added to {status} 📝");

			// Open modal immediately to edit details
			OpenModal(newItem);
		}

		private VisualElement CreateKanbanCard(ProjectItemData item)
		{
			VisualElement card = new VisualElement();
			card.AddToClassList("kanban-item");

			Label title = new Label(item.Title);
			title.AddToClassList("item-title");

			// 1. Priority Strip
			VisualElement strip = new VisualElement();
			strip.AddToClassList("priority-strip");
			string priorityClass = "strip-medium";
			switch (item.Priority)
			{
				case Priority.High: priorityClass = "strip-high"; break;
				case Priority.Low: priorityClass = "strip-low"; break;
			}
			strip.AddToClassList(priorityClass);

			// 2. Tags
			VisualElement tagsContainer = new VisualElement();
			tagsContainer.AddToClassList("tags-container");
			if (item.Tags != null)
			{
				foreach (var tag in item.Tags)
				{
					if (string.IsNullOrWhiteSpace(tag)) continue;
					Label tagChip = new Label(tag);
					tagChip.AddToClassList("tag-chip");
					tagsContainer.Add(tagChip);
				}
			}

			// Edit Button (Keep absolute)
			Button btnEdit = new Button(() => OpenModal(item));
			btnEdit.text = "✎";
			btnEdit.style.position = Position.Absolute;
			btnEdit.style.right = 5;
			btnEdit.style.top = 5;
			btnEdit.style.width = 20;
			btnEdit.style.height = 20;
			btnEdit.style.fontSize = 10;
			btnEdit.style.backgroundColor = new StyleColor(new Color(0, 0, 0, 0.1f));
			btnEdit.style.borderTopWidth = 0;
			btnEdit.style.borderBottomWidth = 0;
			btnEdit.style.borderLeftWidth = 0;
			btnEdit.style.borderRightWidth = 0;

			// Meta (Type & Date)
			VisualElement meta = new VisualElement();
			meta.AddToClassList("item-meta");

			Label typeBadge = new Label(item.Type.ToString());
			typeBadge.AddToClassList("badge");
			typeBadge.AddToClassList($"badge-{item.Type.ToString().ToLower()}");
			meta.Add(typeBadge);

			if (item.DueDate.HasValue)
			{
				Label dateLabel = new Label(item.DueDate.Value.ToString("MM/dd"));
				dateLabel.style.fontSize = 10;
				dateLabel.style.unityFontStyleAndWeight = UnityEngine.FontStyle.Italic;
				dateLabel.style.marginLeft = 5;
				dateLabel.style.color = item.DueDate.Value < System.DateTime.Now.Date ? Color.red : Color.gray;
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
				if (evt.button == 1) // Right Click
				{
					evt.StopPropagation();
					ShowContextMenu(evt.position, item);
					return;
				}

				if (evt.button != 0) return; // Only Left Click for Drag

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

					// Create Ghost Icon
					if (_ghostIcon == null)
					{
						_ghostIcon = new VisualElement();
						_ghostIcon.AddToClassList("kanban-item");
						_ghostIcon.AddToClassList("ghost-icon");
						_ghostIcon.style.position = Position.Absolute;
						_ghostIcon.style.width = card.resolvedStyle.width;
						_ghostIcon.style.height = card.resolvedStyle.height;
						_ghostIcon.style.opacity = 0.6f;
						_ghostIcon.pickingMode = PickingMode.Ignore; // Important: Don't block raycasts
						_ghostIcon.Add(new Label(item.Title)); // Simple ghost content

						ViewContainer.Add(_ghostIcon);
					}
				}

				if (_isDragging && _ghostIcon != null)
				{
					// Update Ghost Position (Convert to Local)
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
						// Drop Logic
						VisualElement target = _kanbanView.panel.Pick(evt.position);

						// Determine Target Column
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

						// Cleanup Ghost
						if (_ghostIcon != null)
						{
							_ghostIcon.RemoveFromHierarchy();
							_ghostIcon = null;
						}

						_isDragging = false;
						_draggingItem = null;

						// Always Refresh to update order/status
						RefreshKanban();
					}
					else
					{
						// Click Event (if not dragged)
						if (evt.clickCount == 2) OpenModal(item);
					}
				}
			});

			return card;
		}

		private VisualElement GetColumnFromTarget(VisualElement target)
		{
			// Traverse up to find column
			// Also Handle dropping ON another card -> Find its parent column
			VisualElement current = target;
			while (current != null)
			{
				// Check by class or name
				if (current.ClassListContains("kanban-column") ||
					current.name == "ColTodo" ||
					current.name == "ColDoing" ||
					current.name == "ColDone")
				{
					return current;
				}
				current = current.parent;
			}
			return null;
		}

		private MemoStatus GetStatusFromColumn(string columnName)
		{
			if (columnName.Contains("Todo")) return MemoStatus.Todo;
			if (columnName.Contains("Doing")) return MemoStatus.Doing;
			if (columnName.Contains("Done")) return MemoStatus.Done;
			return MemoStatus.Todo; // Default
		}
	}
}
