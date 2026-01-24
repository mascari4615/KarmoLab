using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager.Table
{
	public class ProjectTableController
	{
		private readonly ProjectManagerFeature _owner;
		private readonly VisualElement _root;

		private ScrollView _tableList;
		private TextField _inputNewItem;
		private Button _btnAddNewItem;
		private TextField _searchField;
		private Label _headerTitle, _headerStatus, _headerPriority, _headerType, _headerDate;

		private string _sortColumn = "Title";
		private bool _sortAscending = true;

		public ProjectTableController(ProjectManagerFeature owner, VisualElement root, TextField searchField)
		{
			_owner = owner;
			_root = root;
			_searchField = searchField;
			Initialize();
		}

		private void Initialize()
		{
			_tableList = _root.Q<ScrollView>("ProjectItemList");
			_inputNewItem = _root.Q<TextField>("InputNewItem");
			_btnAddNewItem = _root.Q<Button>("BtnAddNewItem");
			// _searchField assigned from constructor

			_headerTitle = _root.Q<Label>("HeaderTitle");
			_headerStatus = _root.Q<Label>("HeaderStatus");
			_headerPriority = _root.Q<Label>("HeaderPriority");
			_headerType = _root.Q<Label>("HeaderType");
			_headerDate = _root.Q<Label>("HeaderDate");

			// Events
			_searchField?.RegisterValueChangedCallback(_ => Refresh());

			_headerTitle?.RegisterCallback<ClickEvent>(_ => ToggleSort("Title"));
			_headerStatus?.RegisterCallback<ClickEvent>(_ => ToggleSort("Status"));
			_headerPriority?.RegisterCallback<ClickEvent>(_ => ToggleSort("Priority"));
			_headerType?.RegisterCallback<ClickEvent>(_ => ToggleSort("Type"));
			_headerDate?.RegisterCallback<ClickEvent>(_ => ToggleSort("Due"));

			if (_btnAddNewItem != null) _btnAddNewItem.clicked += AddNewItem;
			_inputNewItem?.RegisterCallback<KeyDownEvent>(evt => { if (evt.keyCode == KeyCode.Return) AddNewItem(); });
		}

		private void ToggleSort(string column)
		{
			if (_sortColumn == column) _sortAscending = !_sortAscending;
			else { _sortColumn = column; _sortAscending = true; }
			Refresh();
		}

		public void Refresh()
		{
			if (_tableList == null) return;
			_tableList.Clear();

			List<ProjectItemData> allItems = KarmoToysApp.Instance.Data.ProjectItems;
			string searchText = _searchField?.value?.ToLower() ?? "";

			// 1. Filter
			List<ProjectItemData> filteredItems = allItems.FindAll(item =>
				string.IsNullOrEmpty(searchText) ||
				item.Title.ToLower().Contains(searchText) ||
				item.Content.ToLower().Contains(searchText) ||
				item.Tags.Exists(t => t.ToLower().Contains(searchText))
			);

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
						else if (a.DueDate.HasValue) comparison = -1;
						else if (b.DueDate.HasValue) comparison = 1;
						break;
				}
				return _sortAscending ? comparison : -comparison;
			});

			UpdateHeaderVisuals();

			// 3. Render
			foreach (var item in filteredItems)
			{
				var row = CreateRow(item);
				_tableList.Add(row);
			}
		}

		private VisualElement CreateRow(ProjectItemData item)
		{
			var row = new VisualElement();
			row.AddToClassList("table-row");

			var title = new Label(item.Title) { style = { flexGrow = 1 } };
			title.AddToClassList("table-col");

			var status = new Label(item.Status.ToString()) { style = { width = 80 } };
			status.AddToClassList("table-col");
			status.RegisterCallback<MouseDownEvent>(evt =>
			{
				if (evt.button == 0)
				{
					evt.StopPropagation();
					item.Status = (MemoStatus)(((int)item.Status + 1) % 3); // Simple cycle Todo->Doing->Done
					KarmoToysApp.Instance.SaveData();
					_owner.RefreshViews();
				}
			});

			var priority = new Label(item.Priority.ToString()) { style = { width = 80 } };
			priority.AddToClassList("table-col");
			priority.AddToClassList($"priority-{item.Priority.ToString().ToLower().Substring(0, 3)}");
			priority.RegisterCallback<MouseDownEvent>(evt =>
			{
				if (evt.button == 0)
				{
					evt.StopPropagation();
					item.Priority = (Priority)(((int)item.Priority + 1) % 3);
					KarmoToysApp.Instance.SaveData();
					_owner.RefreshViews();
				}
			});

			var type = new Label(item.Type.ToString()) { style = { width = 80 } };
			type.AddToClassList("table-col");

			var dateText = item.DueDate.HasValue ? item.DueDate.Value.ToString("MM/dd") : "-";
			var date = new Label(dateText) { style = { width = 60 } };
			date.AddToClassList("table-col");
			if (item.DueDate.HasValue && item.DueDate.Value < DateTime.Now.Date) date.style.color = Color.red;

			var btnEdit = new Button(() => _owner.OpenModal(item)) { text = "✎", style = { width = 50 } };
			btnEdit.AddToClassList("table-col");

			row.Add(title);
			row.Add(status);
			row.Add(priority);
			row.Add(type);
			row.Add(date);
			row.Add(btnEdit);

			row.RegisterCallback<PointerDownEvent>(evt =>
			{
				if (evt.button == 1)
				{
					evt.StopPropagation();
					_owner.ShowContextMenu(evt.position, item);
				}
			});

			row.RegisterCallback<ClickEvent>(evt =>
			{
				if (evt.clickCount == 2 && evt.button == 0) _owner.OpenModal(item);
			});

			return row;
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
			if (_sortColumn == columnName) text += _sortAscending ? " ▲" : " ▼";
			else text += " ↕";
			label.text = text;
		}

		private void AddNewItem()
		{
			if (string.IsNullOrWhiteSpace(_inputNewItem.value)) return;

			var newItem = new ProjectItemData(_inputNewItem.value, string.Empty);
			KarmoToysApp.Instance.Data.ProjectItems.Add(newItem);
			_inputNewItem.value = string.Empty;

			KarmoToysApp.Instance.SaveData();
			_owner.RefreshViews();
			KarmoToysApp.Toast.Show("New item added! 🚀");
		}
	}
}
