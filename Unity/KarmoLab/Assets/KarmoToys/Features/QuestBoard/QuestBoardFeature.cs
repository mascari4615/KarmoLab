using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.QuestBoard
{
	public class QuestBoardFeature : FeatureBase
	{
		public override string FeatureName => Define.FeatureQuestBoard;
		public override string TabButtonName => Define.TabTasks;

		private ScrollView _listPersonal, _listStudy, _listTeam;
		private TextField _inputPersonal, _inputStudy, _inputTeam;
		private Button _btnAddPersonal, _btnAddStudy, _btnAddTeam;

		public override void Initialize(VisualElement root)
		{
			ViewContainer = root.Q("ViewTasks");

			_listPersonal = root.Q<ScrollView>("ListPersonal");
			_listStudy = root.Q<ScrollView>("ListStudy");
			_listTeam = root.Q<ScrollView>("ListTeam");

			_inputPersonal = root.Q<TextField>("InputPersonal");
			_inputStudy = root.Q<TextField>("InputStudy");
			_inputTeam = root.Q<TextField>("InputTeam");

			_btnAddPersonal = root.Q<Button>("BtnAddPersonal");
			_btnAddStudy = root.Q<Button>("BtnAddStudy");
			_btnAddTeam = root.Q<Button>("BtnAddTeam");

			if (_btnAddPersonal != null) _btnAddPersonal.clicked += () => AddTodo("personal", _inputPersonal, _listPersonal);
			if (_btnAddStudy != null) _btnAddStudy.clicked += () => AddTodo("study", _inputStudy, _listStudy);
			if (_btnAddTeam != null) _btnAddTeam.clicked += () => AddTodo("team", _inputTeam, _listTeam);
		}

		public override void OnSelect()
		{
			base.OnSelect();
			RefreshAllTasks();
		}

		private void RefreshAllTasks()
		{
			RefreshTasks(_listPersonal, "personal");
			RefreshTasks(_listStudy, "study");
			RefreshTasks(_listTeam, "team");
		}

		private void AddTodo(string category, TextField input, ScrollView list)
		{
			if (input == null || string.IsNullOrWhiteSpace(input.value)) return;

			var data = KarmoToysApp.Instance.Data?.Planner;
			if (data == null) return;

			data.Items.Add(new TodoItem(input.value, category));
			input.value = "";

			KarmoToysApp.Instance.SaveData();
			RefreshTasks(list, category);
		}

		private void RefreshTasks(ScrollView list, string category)
		{
			if (list == null) return;
			list.Clear();

			var data = KarmoToysApp.Instance.Data?.Planner;
			if (data == null) return;

			var items = data.Items.Where(i => i.Category == category).ToList();

			foreach (var item in items)
			{
				var row = new VisualElement();
				row.AddToClassList("todo-item");

				// Toggle Button
				var toggle = new Button(() =>
				{
					item.IsCompleted = !item.IsCompleted;
					KarmoToysApp.Instance.SaveData();
					RefreshTasks(list, category); // Refresh to showing strikethrough logic (if any)
				});
				toggle.AddToClassList("todo-toggle");
				if (item.IsCompleted) toggle.AddToClassList("completed");

				// Content Label
				var label = new Label(item.Content);
				label.AddToClassList("todo-content");
				if (item.IsCompleted) label.AddToClassList("completed");

				// Delete Button
				var delBtn = new Button(() =>
				{
					data.Items.Remove(item);
					KarmoToysApp.Instance.SaveData();
					RefreshTasks(list, category);
				});
				delBtn.text = "x";
				delBtn.AddToClassList("todo-delete");

				row.Add(toggle);
				row.Add(label);
				row.Add(delBtn);

				list.Add(row);
			}
		}
	}
}
