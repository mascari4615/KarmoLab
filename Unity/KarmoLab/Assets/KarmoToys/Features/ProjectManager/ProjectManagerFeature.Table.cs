using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager
{
	public partial class ProjectManagerFeature
	{
		private string _sortColumn = "Title";
		private bool _sortAscending = true;

		private void ToggleSort(string column)
		{
			if (_sortColumn == column)
			{
				_sortAscending = !_sortAscending;
			}
			else
			{
				_sortColumn = column;
				_sortAscending = true;
			}
			RefreshTable();
		}

		private void RefreshTable()
		{
			_tableList.Clear();
			List<ProjectItemData> allItems = KarmoToysApp.Instance.Data.ProjectItems;

			// 1. Filter
			string searchText = _searchField?.value?.ToLower() ?? "";
			List<ProjectItemData> filteredItems = new List<ProjectItemData>();

			foreach (var item in allItems)
			{
				bool match = string.IsNullOrEmpty(searchText);
				if (!match)
				{
					if (item.Title.ToLower().Contains(searchText)) match = true;
					else if (item.Content.ToLower().Contains(searchText)) match = true;
					else if (item.Tags.Exists(t => t.ToLower().Contains(searchText))) match = true;
				}

				if (match) filteredItems.Add(item);
			}

			// 2. Sort
			filteredItems.Sort((a, b) =>
			{
				int comparison = 0;
				switch (_sortColumn)
				{
					case "Title": comparison = string.Compare(a.Title, b.Title); break;
					case "Status": comparison = a.Status.CompareTo(b.Status); break;
					case "Priority": comparison = a.Priority.CompareTo(b.Priority); break;
					case "Type": comparison = a.Type.CompareTo(b.Type); break;
					case "Due":
						if (a.DueDate.HasValue && b.DueDate.HasValue) comparison = a.DueDate.Value.CompareTo(b.DueDate.Value);
						else if (a.DueDate.HasValue) comparison = -1; // Has date comes first
						else if (b.DueDate.HasValue) comparison = 1;
						else comparison = 0;
						break;
					default: comparison = 0; break;
				}
				return _sortAscending ? comparison : -comparison;
			});

			// Update Header Arrows
			UpdateHeaderVisuals();

			// 3. Render
			foreach (ProjectItemData item in filteredItems)
			{
				VisualElement row = new VisualElement();
				row.AddToClassList("table-row");

				Label title = new Label(item.Title);
				title.style.flexGrow = 1;
				title.AddToClassList("table-col");


				Label status = new Label(item.Status.ToString());
				status.style.width = 80;
				status.AddToClassList("table-col");
				status.RegisterCallback<MouseDownEvent>(evt =>
				{
					if (evt.button == 0) // Left click
					{
						evt.StopPropagation(); // Prevent row selection/modal opening

						// Cycle Status: Todo -> Doing -> Done -> Todo
						switch (item.Status)
						{
							case MemoStatus.Todo: item.Status = MemoStatus.Doing; break;
							case MemoStatus.Doing: item.Status = MemoStatus.Done; break;
							case MemoStatus.Done: item.Status = MemoStatus.Todo; break;
							default: item.Status = MemoStatus.Todo; break;
						}
						KarmoToysApp.Instance.SaveData();
						RefreshViews(); // Refresh to update visuals
					}
				});

				Label priority = new Label(item.Priority.ToString());
				priority.style.width = 80;
				priority.AddToClassList("table-col");
				priority.AddToClassList($"priority-{item.Priority.ToString().ToLower().Substring(0, 3)}");
				priority.RegisterCallback<MouseDownEvent>(evt =>
				{
					if (evt.button == 0)
					{
						evt.StopPropagation();

						// Cycle Priority: Low -> Medium -> High -> Low
						switch (item.Priority)
						{
							case Priority.Low: item.Priority = Priority.Medium; break;
							case Priority.Medium: item.Priority = Priority.High; break;
							case Priority.High: item.Priority = Priority.Low; break;
							default: item.Priority = Priority.Medium; break;
						}
						KarmoToysApp.Instance.SaveData();
						RefreshViews();
					}
				});

				Label type = new Label(item.Type.ToString());
				type.style.width = 80;
				type.AddToClassList("table-col");

				Label date = new Label(item.DueDate.HasValue ? item.DueDate.Value.ToString("MM/dd") : "-");
				date.style.width = 60;
				date.AddToClassList("table-col");
				if (item.DueDate.HasValue && item.DueDate.Value < System.DateTime.Now.Date) date.style.color = Color.red;

				Button btnEdit = new Button(() => OpenModal(item));
				btnEdit.text = "✎";
				btnEdit.style.width = 50;
				btnEdit.AddToClassList("table-col");

				row.Add(title);
				row.Add(status);
				row.Add(priority);
				row.Add(type);
				row.Add(date);
				row.Add(btnEdit);

				// Basic Interaction: Double click to edit or Right click for context menu
				row.RegisterCallback<PointerDownEvent>(evt =>
				{
					if (evt.button == 1) // Right Click
					{
						evt.StopPropagation(); // Prevent standard context menu if any
						ShowContextMenu(evt.position, item);
					}
				});

				row.RegisterCallback<ClickEvent>(evt =>
				{
					if (evt.clickCount == 2 && evt.button == 0) OpenModal(item);
				});

				_tableList.Add(row);
			}
		}

		private void UpdateHeaderVisuals()
		{
			SetHeaderText(_headerTitle, "Title");
			SetHeaderText(_headerStatus, "Status");
			SetHeaderText(_headerPriority, "Priority");
			SetHeaderText(_headerType, "Type");
			SetHeaderText(_headerDate, "Due");
		}

		private void SetHeaderText(Label label, string columnName)
		{
			if (label == null) return;
			string text = columnName;
			if (_sortColumn == columnName)
			{
				text += _sortAscending ? " ▲" : " ▼";
			}
			else
			{
				text += " ↕";
			}
			label.text = text;
		}

		private void AddNewItem()
		{
			if (string.IsNullOrWhiteSpace(_inputNewItem.value)) return;

			ProjectItemData newItem = new ProjectItemData(_inputNewItem.value, string.Empty);
			KarmoToysApp.Instance.Data.ProjectItems.Add(newItem);
			_inputNewItem.value = string.Empty;

			KarmoToysApp.Instance.SaveData();
			RefreshViews();
			KarmoToysApp.Toast.Show("New item added! 🚀");
		}
	}
}
