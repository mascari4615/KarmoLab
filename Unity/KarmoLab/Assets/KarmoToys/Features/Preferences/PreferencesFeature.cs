using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;
using KarmoToys.Common.Data;

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
		private Label _backupDiffResult;

		// Confirmation Popup
		private VisualElement _confirmationOverlay;
		private Label _confirmMessage;
		private Button _btnConfirmCancel, _btnConfirmDelete;
		private string _pendingDeletePath;

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
			_backupDiffResult = root.Q<Label>("BackupDiffResult");

			// 3. Confirmation Popup
			_confirmationOverlay = root.Q<VisualElement>("ConfirmationOverlay");
			_confirmMessage = root.Q<Label>("ConfirmMessage");
			_btnConfirmCancel = root.Q<Button>("BtnConfirmCancel");
			_btnConfirmDelete = root.Q<Button>("BtnConfirmDelete");

			if (_btnConfirmCancel != null) _btnConfirmCancel.clicked += HideConfirmation;
			if (_btnConfirmDelete != null) _btnConfirmDelete.clicked += ConfirmDelete;

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
			KarmoToysData data = KarmoToysApp.Instance.Data;
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
			List<FileInfo> backups = DataService.GetBackupFiles(savePath);
			foreach (FileInfo file in backups)
			{
				VisualElement row = new VisualElement();
				row.AddToClassList("backup-item");

				// 파일명 전체 표시
				string displayText = $"{file.Name} ({file.Length / 1024f:F1}KB)";

				Label label = new Label(displayText);
				label.AddToClassList("backup-item-label");

				Button btnDiff = new Button(() => ShowDiff(file.FullName));
				btnDiff.text = "🔍";
				btnDiff.tooltip = "Compare with current";
				btnDiff.AddToClassList("btn-icon-item");
				btnDiff.style.width = 30;

				Button btnLoad = new Button(() => OnClickBackupFile(file.FullName));
				btnLoad.text = "📂";
				btnLoad.tooltip = "Load this backup";
				btnLoad.AddToClassList("btn-icon-item");
				btnLoad.style.width = 30;

				Button btnDelete = new Button(() => RequestDeleteBackup(file.FullName));
				btnDelete.text = "🗑️";
				btnDelete.tooltip = "Delete this backup";
				btnDelete.AddToClassList("btn-icon-item");
				btnDelete.AddToClassList("danger");
				btnDelete.style.width = 30;

				row.Add(label);
				row.Add(btnDiff);
				row.Add(btnLoad);
				row.Add(btnDelete);
				_backupFileList.Add(row);
			}
		}

		private void ShowDiff(string backupPath)
		{
			if (KarmoToysApp.Instance.Data == null) return;

			// 백업 데이터 로드 (메모리상에서만)
			KarmoToysData backupData = DataService.Load(backupPath);
			// 현재 데이터와 비교
			string diffSummary = DataService.GetDiffSummary(backupData, KarmoToysApp.Instance.Data);

			// 결과 출력
			Label diffLabel = ViewContainer.Q<Label>("BackupDiffResult");
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

		private void RequestDeleteBackup(string path)
		{
			_pendingDeletePath = path;
			if (_confirmMessage != null) _confirmMessage.text = $"'{Path.GetFileName(path)}' 파일을\n정말 삭제하시겠습니까?";
			if (_confirmationOverlay != null) _confirmationOverlay.style.display = DisplayStyle.Flex;
		}

		private void HideConfirmation()
		{
			if (_confirmationOverlay != null) _confirmationOverlay.style.display = DisplayStyle.None;
			_pendingDeletePath = null;
		}

		private void ConfirmDelete()
		{
			if (string.IsNullOrEmpty(_pendingDeletePath)) return;

			try
			{
				if (File.Exists(_pendingDeletePath))
				{
					File.Delete(_pendingDeletePath);
					KarmoToysApp.Toast.Show("백업 파일이 삭제되었습니다. 🗑️");
				}
			}
			catch (Exception e)
			{
				Debug.LogError($"Failed to delete backup: {e.Message}");
				KarmoToysApp.Toast.Show("삭제 실패. ❌");
			}

			HideConfirmation();
			RefreshBackupList();
		}
	}
}
