using System;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.Dashboard
{
	public class DashboardFeature : FeatureBase
	{
		public override string FeatureName => Define.FeatureDashboard;
		public override string TabButtonName => Define.TabDashboard;

		// UI Refs
		private Label _statProgress;
		private TextField _memoInput;
		private TextField _configTargetDate;
		private Button _saveMemoBtn;

		// Global Header (Managed here for now as per plan)
		private TextField _headerTargetInput;
		private Label _headerDDay;
		private Label _headerPersonal, _headerStudy, _headerTeam;
		private Label _statPersonalTitle, _statPersonalValue;
		private Label _statTeamTitle, _statTeamValue;

		public override void Initialize(VisualElement root)
		{
			// View Container
			ViewContainer = root.Q("ViewDashboard");

			// Element Binding
			_statProgress = root.Q<Label>("StatProgress");

			_memoInput = root.Q<TextField>("MemoInput");
			_configTargetDate = root.Q<TextField>("ConfigTargetDate");
			_saveMemoBtn = root.Q<Button>("SaveMemoBtn");

			// Header Elements (Global)
			_headerTargetInput = root.Q<TextField>("HeaderTargetInput");
			_headerDDay = root.Q<Label>("HeaderDDayLabel");
			_headerPersonal = root.Q<Label>("HeaderPersonal");
			_headerStudy = root.Q<Label>("HeaderStudy");
			_headerTeam = root.Q<Label>("HeaderTeam");

			_statPersonalTitle = root.Q<Label>("StatPersonalTitle");
			_statPersonalValue = root.Q<Label>("StatPersonalValue");
			_statTeamTitle = root.Q<Label>("StatTeamTitle");
			_statTeamValue = root.Q<Label>("StatTeamValue");

			// Events
			if (_saveMemoBtn != null) _saveMemoBtn.clicked += OnSave;
		}

		public override void OnSelect()
		{
			base.OnSelect();
			RefreshDashboard();
		}

		private void RefreshDashboard()
		{
			var data = KarmoToysApp.Instance.Data?.Planner;
			if (data == null) return;

			// Header Update
			if (string.IsNullOrEmpty(data.TargetName)) data.TargetName = Define.DefaultTargetName;
			if (string.IsNullOrEmpty(data.TargetDateString)) data.TargetDateString = Define.DefaultTargetDate;

			if (_headerTargetInput != null) _headerTargetInput.value = data.TargetName;

			string dDayStr = "D-???";
			if (DateTime.TryParse(data.TargetDateString, out DateTime target))
			{
				var diff = (target - DateTime.Now).Days;
				dDayStr = $"D{diff:+#;-#;0}";
			}
			if (_headerDDay != null) _headerDDay.text = dDayStr;
			if (_statProgress != null) _statProgress.text = dDayStr;

			// Content Update
			if (_memoInput != null) _memoInput.value = data.MemoContent;
			if (_configTargetDate != null) _configTargetDate.value = data.TargetDateString;

			// Quest/Stats Title Update
			if (_headerPersonal != null) _headerPersonal.text = data.PersonalQuestTitle;
			if (_headerStudy != null) _headerStudy.text = data.StudyQuestTitle;
			if (_headerTeam != null) _headerTeam.text = data.TeamQuestTitle;

			if (_statPersonalTitle != null) _statPersonalTitle.text = data.StatPersonalTitle;
			if (_statPersonalValue != null) _statPersonalValue.text = data.StatPersonalValue;
			if (_statTeamTitle != null) _statTeamTitle.text = data.StatTeamTitle;
			if (_statTeamValue != null) _statTeamValue.text = data.StatTeamValue;
		}

		private void OnSave()
		{
			var data = KarmoToysApp.Instance.Data?.Planner;
			if (data == null) return;

			// Update Data
			if (_memoInput != null) data.MemoContent = _memoInput.value;
			if (_headerTargetInput != null) data.TargetName = _headerTargetInput.value;
			if (_configTargetDate != null) data.TargetDateString = _configTargetDate.value;

			// Save via App
			KarmoToysApp.Instance.SaveData();

			// Refresh UI
			RefreshDashboard();
			KarmoToysApp.Toast.Show("Dashboard Saved! 💾");
		}
	}
}
