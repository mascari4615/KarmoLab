using System;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;

namespace KarmoToys.Features.Preferences
{
	[AddComponentMenu("KarmoLab/Features/Preferences")]
	public class PreferencesFeature : FeatureBase
	{
		public override string FeatureName => Define.FeaturePreferences;
		public override string TabButtonName => Define.TabPreferences;

		// UI Elements
		private Toggle _autoBackupToggle;
		private IntegerField _thresholdInput;
		private IntegerField _maxBackupCountInput;
		private Button _btnOpenSaveDir;
		private Button _btnResetData;
		private Button _btnRefreshData;
		private ScrollView _backupFileList;

		// Theme UI (Optional, if we want detailed control)
		private DropdownField _themeDropdown;

		public override void Initialize(VisualElement root)
		{
			ViewContainer = root.Q("ViewPreferences");
			if (ViewContainer == null) return;

			// 1. Backup Settings
			_autoBackupToggle = root.Q<Toggle>("AutoBackupToggle");
			_thresholdInput = root.Q<IntegerField>("ThresholdInput");
			_maxBackupCountInput = root.Q<IntegerField>("MaxBackupCountInput");

			// Bind Events
			_autoBackupToggle?.RegisterValueChangedCallback(evt =>
			{
				if (KarmoToysApp.Instance.Data != null)
				{
					KarmoToysApp.Instance.Data.AutoBackupOnSave = evt.newValue;
					KarmoToysApp.Instance.SaveData(false);
				}
			});

			_thresholdInput?.RegisterValueChangedCallback(evt =>
			{
				if (KarmoToysApp.Instance.Data != null)
				{
					KarmoToysApp.Instance.Data.SignificantChangeThreshold = evt.newValue;
					KarmoToysApp.Instance.SaveData(false);
				}
			});

			_maxBackupCountInput?.RegisterValueChangedCallback(evt =>
			{
				if (KarmoToysApp.Instance.Data != null)
				{
					KarmoToysApp.Instance.Data.MaxBackupCount = evt.newValue;
					KarmoToysApp.Instance.SaveData(false);
				}
			});

			// 2. Data Management
			_btnOpenSaveDir = root.Q<Button>("BtnOpenSaveDir");
			_btnOpenSaveDir.clicked += () =>
			{
				string dir = KarmoToysApp.Instance.GetSaveDirectory();
				if (!string.IsNullOrEmpty(dir)) Application.OpenURL("file://" + dir);
			};

			_btnResetData = root.Q<Button>("BtnResetData");
			_btnResetData.clicked += OnResetData;

			_btnRefreshData = root.Q<Button>("BtnRefreshData");
			_btnRefreshData.clicked += OnRefreshData;

			_backupFileList = root.Q<ScrollView>("BackupFileList");

			// 3. Theme (Example)
			// _themeDropdown = root.Q<DropdownField>("ThemeDropdown");
		}

		public override void OnSelect()
		{
			base.OnSelect();
			RefreshUI();
			RefreshBackupList();
		}

		private void RefreshUI()
		{
			var data = KarmoToysApp.Instance.Data;
			if (data != null)
			{
				_autoBackupToggle?.SetValueWithoutNotify(data.AutoBackupOnSave);
				_thresholdInput?.SetValueWithoutNotify(data.SignificantChangeThreshold);
				_maxBackupCountInput?.SetValueWithoutNotify(data.MaxBackupCount);
			}
		}

		private void OnResetData()
		{
			// TODO: Add robust confirmation dialog
			// For now, simple log or toast
			Debug.LogWarning("Reset Data Requested. Implementation Pending Confirmation UI.");
			KarmoToysApp.Toast.Show("데이터 초기화 기능 준비 중. 🚧");
		}

		private void OnRefreshData()
		{
			KarmoToysApp.Instance.LoadData();
			RefreshUI();
			KarmoToysApp.Toast.Show("데이터 새로고침 완료. 🔄");
		}

		private void RefreshBackupList()
		{
			if (_backupFileList == null) return;
			_backupFileList.Clear();

			string savePath = KarmoToysApp.Instance.SavePath;
			if (string.IsNullOrEmpty(savePath)) return;

			// Flat Structure: 현재 파일을 기반으로 필터링
			var backups = DataService.GetBackupFiles(savePath);
			foreach (var file in backups)
			{
				var row = new VisualElement();
				row.style.flexDirection = FlexDirection.Row;
				row.style.alignItems = Align.Center;
				row.style.marginBottom = 2;
				row.style.justifyContent = Justify.SpaceBetween;

				// 파일명 전체 표시
				string displayText = $"{file.Name} ({file.Length / 1024f:F1}KB)";

				var label = new Label(displayText);
				label.style.flexGrow = 1;
				label.style.color = new StyleColor(new Color(0.8f, 0.8f, 0.8f));

				var btnDiff = new Button(() => ShowDiff(file.FullName));
				btnDiff.text = "차이";
				btnDiff.tooltip = "Compare with current";
				btnDiff.style.width = 40;

				var btnLoad = new Button(() => OnClickBackupFile(file.FullName));
				btnLoad.text = "로드";
				btnLoad.tooltip = "Load this backup";
				btnLoad.style.width = 40;

				row.Add(label);
				row.Add(btnDiff);
				row.Add(btnLoad);
				_backupFileList.Add(row);
			}
		}

		private void ShowDiff(string backupPath)
		{
			if (KarmoToysApp.Instance.Data == null) return;

			// 백업 데이터 로드 (메모리상에서만)
			var backupData = DataService.Load(backupPath);
			// 현재 데이터와 비교
			string diffSummary = DataService.GetDiffSummary(backupData, KarmoToysApp.Instance.Data);

			// 결과 출력
			var diffLabel = ViewContainer.Q<Label>("BackupDiffResult");
			if (diffLabel != null)
			{
				diffLabel.text = diffSummary;
			}
		}

		private void OnClickBackupFile(string path)
		{
			KarmoToysApp.Instance.LoadBackup(path);
			RefreshBackupList();
			RefreshUI();
			KarmoToysApp.Toast.Show("백업 데이터 로드 완료. (안전 백업 생성됨) 🛡️");
		}
	}
}
