using System;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoLab.Module.Planner
{
	public partial class PlannerController
	{
		private void RefreshAll()
		{
			if (_data == null) return;
			// 헤더 업데이트
			if (string.IsNullOrEmpty(_data.TargetName)) _data.TargetName = "Target: Project (yyyy.mm)";
			if (string.IsNullOrEmpty(_data.TargetDateString)) _data.TargetDateString = "2027-03-01";
			if (_headerTargetInput != null) _headerTargetInput.value = _data.TargetName;

			string dDayStr = "D-???";
			if (_headerDDay != null)
			{
				if (DateTime.TryParse(_data.TargetDateString, out DateTime target))
				{
					var diff = (target - DateTime.Now).Days;
					dDayStr = $"D{diff:+#;-#;0}";
				}
				_headerDDay.text = dDayStr;
			}

			if (_memoInput != null) _memoInput.value = _data.MemoContent;
			if (_configTargetDate != null) _configTargetDate.value = _data.TargetDateString;
			if (_statProgress != null) _statProgress.text = dDayStr;

			if (_headerPersonal != null) _headerPersonal.text = _data.PersonalQuestTitle;
			if (_headerStudy != null) _headerStudy.text = _data.StudyQuestTitle;
			if (_headerTeam != null) _headerTeam.text = _data.TeamQuestTitle;

			if (_statPersonalTitle != null) _statPersonalTitle.text = _data.StatPersonalTitle;
			if (_statPersonalValue != null) _statPersonalValue.text = _data.StatPersonalValue;
			if (_statTeamTitle != null) _statTeamTitle.text = _data.StatTeamTitle;
			if (_statTeamValue != null) _statTeamValue.text = _data.StatTeamValue;

			RefreshTasks(_listPersonal, "personal");
			RefreshTasks(_listStudy, "study");
			RefreshTasks(_listTeam, "team");
			RefreshSecretNotes();
			RefreshSchedule();
		}

		private void SaveMemo()
		{
			if (_data == null) return;
			if (_memoInput != null) _data.MemoContent = _memoInput.value;
			if (_headerTargetInput != null) _data.TargetName = _headerTargetInput.value;
			if (_configTargetDate != null) _data.TargetDateString = _configTargetDate.value;
			SaveData();
			RefreshAll();
		}

		private void AddTodo(string category, TextField input)
		{
			if (input == null || string.IsNullOrWhiteSpace(input.value)) return;
			_data.Items.Add(new TodoItem(input.value, category));
			input.value = "";
			SaveData();
			if (category == "personal") RefreshTasks(_listPersonal, "personal");
			else if (category == "study") RefreshTasks(_listStudy, "study");
			else if (category == "team") RefreshTasks(_listTeam, "team");
		}

		private void RefreshTasks(ScrollView list, string category)
		{
			if (list == null) return;
			list.Clear();
			var items = _data.Items.Where(i => i.Category == category).ToList();
			foreach (var item in items)
			{
				var row = new VisualElement();
				row.AddToClassList("todo-item");
				var toggle = new Button(() =>
				{
					item.IsCompleted = !item.IsCompleted;
					SaveData();
					RefreshTasks(list, category);
				});
				toggle.AddToClassList("todo-toggle");
				if (item.IsCompleted) toggle.AddToClassList("completed");
				var label = new Label(item.Content);
				label.AddToClassList("todo-content");
				if (item.IsCompleted) label.AddToClassList("completed");
				var delBtn = new Button(() =>
				{
					_data.Items.Remove(item);
					SaveData();
					RefreshTasks(list, category);
				});
				delBtn.text = "x";
				delBtn.AddToClassList("todo-delete");
				row.Add(toggle); row.Add(label); row.Add(delBtn);
				list.Add(row);
			}
		}

		private void AddSecretNote()
		{
			if (_secProblem == null || string.IsNullOrWhiteSpace(_secProblem.value)) return;
			_data.SecretNotes.Add(new SecretNote(_secProblem.value, _secWhy.value, _secSolution.value));
			_secProblem.value = ""; _secWhy.value = ""; _secSolution.value = "";
			SaveData(); RefreshSecretNotes();
		}

		private void RefreshSecretNotes()
		{
			if (_secList == null) return;
			_secList.Clear();
			foreach (var note in _data.SecretNotes.OrderByDescending(n => n.DateString))
			{
				var item = new VisualElement();
				item.AddToClassList("secret-item");
				var title = new Label($"[{note.DateString}] {note.Problem}");
				title.style.unityFontStyleAndWeight = FontStyle.Bold;
				title.style.color = new Color(0.85f, 0.7f, 1f);
				var reason = new Label($"Why: {note.Why}");
				reason.style.fontSize = 12; reason.style.color = Color.gray;
				var sol = new Label($"Solution: {note.Solution}");
				sol.style.whiteSpace = WhiteSpace.Normal; sol.style.marginTop = 5;
				item.Add(title); item.Add(reason); item.Add(sol);
				_secList.Add(item);
			}
		}

		private void AddTodoPersonal() => AddTodo("personal", _inputPersonal);
		private void AddTodoStudy() => AddTodo("study", _inputStudy);
		private void AddTodoTeam() => AddTodo("team", _inputTeam);
	}
}