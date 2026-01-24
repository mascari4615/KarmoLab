using System;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;

namespace KarmoToys.Features.Dashboard
{
	[AddComponentMenu("KarmoToys/Features/DashboardFeature")]
	public class DashboardFeature : FeatureBase
	{
		public override string FeatureName => Define.FeatureDashboard;
		public override string TabButtonName => Define.TabDashboard;

		// UI Refs
		private Label _adviceLabel;
		private Label _statProgress;
		private TextField _memoInput;
		private TextField _configTargetDate;
		private Button _saveMemoBtn;

		// Global Header (Managed here for now as per plan)
		private TextField _headerTargetInput;
		private Label _headerDDay;
		private Label _statPersonalTitle, _statPersonalValue;
		private Label _statTeamTitle, _statTeamValue;

		public override void Initialize(VisualElement root)
		{
			// View Container
			ViewContainer = root.Q("ViewDashboard");

			// Element Binding
			_adviceLabel = ViewContainer.Q<Label>("AdviceLabel");
			_statProgress = ViewContainer.Q<Label>("StatProgress");
			_memoInput = ViewContainer.Q<TextField>("MemoInput");
			_configTargetDate = ViewContainer.Q<TextField>("ConfigTargetDate");
			_saveMemoBtn = ViewContainer.Q<Button>("SaveMemoBtn");

			// Header Elements (Global vs Local)
			_headerTargetInput = ViewContainer.Q<TextField>("HeaderTargetInput");
			_headerDDay = root.Q<Label>("HeaderDDayLabel");

			_statPersonalTitle = ViewContainer.Q<Label>("StatPersonalTitle");
			_statPersonalValue = ViewContainer.Q<Label>("StatPersonalValue");
			_statTeamTitle = ViewContainer.Q<Label>("StatTeamTitle");
			_statTeamValue = ViewContainer.Q<Label>("StatTeamValue");

			// Events
			_saveMemoBtn.clicked += OnSave;
		}

		public override void OnSelect()
		{
			base.OnSelect();
			RefreshDashboard();
		}

		private void RefreshDashboard()
		{
			if (KarmoToysApp.Instance.Data == null)
				return;

			DashboardData dashboard = KarmoToysApp.Instance.Data.Dashboard;

			// Header Update

			// TODO: AdviceLabel Text 랜덤 - KarmoDDrine 2026-01-24
			// string randomAdvice = KarmoToysApp.Instance.GetRandomAdvice();
			string randomAdvice = "지금 자면 꿈을 꾸지만, 지금 코딩하면 꿈을 이룬다."; // 임시 고정문구
			_adviceLabel.text = $"NPC 멘토의 한마디: {randomAdvice}";

			if (string.IsNullOrEmpty(dashboard.TargetName)) dashboard.TargetName = Define.DefaultTargetName;
			if (string.IsNullOrEmpty(dashboard.TargetDateString)) dashboard.TargetDateString = Define.DefaultTargetDate;

			_headerTargetInput.value = dashboard.TargetName;

			string dDayStr = "D-???";
			if (DateTime.TryParse(dashboard.TargetDateString, out DateTime target))
			{
				int diff = (target - DateTime.Now).Days;
				dDayStr = $"D{diff:+#;-#;0}";
			}
			_headerDDay.text = dDayStr;
			_statProgress.text = dDayStr;

			// Content Update
			_memoInput.value = dashboard.MemoContent;
			_configTargetDate.value = dashboard.TargetDateString;

			// Dashboard Data
			_statPersonalTitle.text = dashboard.StatPersonalTitle;
			_statPersonalValue.text = dashboard.StatPersonalValue;
			_statTeamTitle.text = dashboard.StatTeamTitle;
			_statTeamValue.text = dashboard.StatTeamValue;
		}

		private void OnSave()
		{
			if (KarmoToysApp.Instance.Data == null)
				return;

			DashboardData dashboard = KarmoToysApp.Instance.Data.Dashboard;

			// Update Data
			_memoInput.value = dashboard.MemoContent;
			_headerTargetInput.value = dashboard.TargetName;
			_configTargetDate.value = dashboard.TargetDateString;

			// Save via App
			KarmoToysApp.Instance.SaveData();

			// Refresh UI
			RefreshDashboard();
			KarmoToysApp.Toast.Show("Dashboard Saved! ?��");
		}
	}
}
