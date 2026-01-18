using System;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;
using KarmoToys.Common.Data;
using KarmoToys.Features.QuestBoard;

namespace KarmoToys.Features.Dashboard
{
	[AddComponentMenu("KarmoLab/Features/Dashboard")]
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

			// These might not exist in current UI
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
			if (KarmoToysApp.Instance.Data == null) return;
			DashboardData dashboard = KarmoToysApp.Instance.Data.Dashboard;
			QuestData quest = KarmoToysApp.Instance.Data.Quest;

			if (dashboard == null) return;

			// Header Update
			if (string.IsNullOrEmpty(dashboard.TargetName)) dashboard.TargetName = Define.DefaultTargetName;
			if (string.IsNullOrEmpty(dashboard.TargetDateString)) dashboard.TargetDateString = Define.DefaultTargetDate;

			if (_headerTargetInput != null) _headerTargetInput.value = dashboard.TargetName;

			string dDayStr = "D-???";
			if (DateTime.TryParse(dashboard.TargetDateString, out DateTime target))
			{
				int diff = (target - DateTime.Now).Days;
				dDayStr = $"D{diff:+#;-#;0}";
			}
			if (_headerDDay != null) _headerDDay.text = dDayStr;
			if (_statProgress != null) _statProgress.text = dDayStr;

			// Content Update
			if (_memoInput != null) _memoInput.value = dashboard.MemoContent;
			if (_configTargetDate != null) _configTargetDate.value = dashboard.TargetDateString;

			// Quest/Stats Title Update (Quest Data)
			if (quest != null)
			{
				if (_headerPersonal != null) _headerPersonal.text = quest.PersonalQuestTitle;
				if (_headerStudy != null) _headerStudy.text = quest.StudyQuestTitle;
				if (_headerTeam != null) _headerTeam.text = quest.TeamQuestTitle;
			}

			// Dashboard Data
			if (_statPersonalTitle != null) _statPersonalTitle.text = dashboard.StatPersonalTitle;
			if (_statPersonalValue != null) _statPersonalValue.text = dashboard.StatPersonalValue;
			if (_statTeamTitle != null) _statTeamTitle.text = dashboard.StatTeamTitle;
			if (_statTeamValue != null) _statTeamValue.text = dashboard.StatTeamValue;
		}

		private void OnSave()
		{
			if (KarmoToysApp.Instance.Data == null) return;
			DashboardData dashboard = KarmoToysApp.Instance.Data.Dashboard;
			if (dashboard == null) return;

			// Update Data
			if (_memoInput != null) dashboard.MemoContent = _memoInput.value;
			if (_headerTargetInput != null) dashboard.TargetName = _headerTargetInput.value;
			if (_configTargetDate != null) dashboard.TargetDateString = _configTargetDate.value;

			// Save via App
			KarmoToysApp.Instance.SaveData();

			// Refresh UI
			RefreshDashboard();
			KarmoToysApp.Toast.Show("Dashboard Saved! ?��");
		}
	}
}
