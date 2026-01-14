using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;

namespace KarmoToys.Features.ToolBox
{
	[AddComponentMenu("KarmoLab/Features/ToolBox")]
	public class ToolBoxFeature : FeatureBase
	{
		public override string FeatureName => Define.FeatureToolBox; // "ToolBox"
		public override string TabButtonName => Define.TabTools;     // "TabTools"

		// UI
		private Label _toolTitle, _toolDescription;
		private DropdownField _toolSelector, _actionSelector;

		private Label _labelInputMain, _labelInputSub;
		private TextField _inputMain, _inputSub, _outputField;
		private Button _btnRunAction, _btnCopyOutput;
		private Button _btnOpenSaveDir, _btnRefreshData;
		private IntegerField _maxBackupCountInput, _thresholdInput; // [NEW] Threshold
		private Toggle _autoBackupToggle; // [NEW] AutoBackup
		private ScrollView _backupFileList;

		// Logic
		private List<ITool> _tools = new List<ITool>();
		private ITool _currentTool;
		private ToolAction _currentAction;

		public override void Initialize(VisualElement root)
		{
			ViewContainer = root.Q("ViewTools");

			_toolTitle = root.Q<Label>("ToolTitle");
			_toolDescription = root.Q<Label>("ToolDescription");
			_toolSelector = root.Q<DropdownField>("ToolSelector");
			_actionSelector = root.Q<DropdownField>("ActionSelector");

			_labelInputMain = root.Q<Label>("LabelInputMain");
			_labelInputSub = root.Q<Label>("LabelInputSub");
			_inputMain = root.Q<TextField>("InputMain");
			_inputSub = root.Q<TextField>("InputSub");

			_btnRunAction = root.Q<Button>("BtnRunAction");
			_outputField = root.Q<TextField>("OutputField");
			_btnCopyOutput = root.Q<Button>("BtnCopyOutput");

			_btnOpenSaveDir = root.Q<Button>("BtnOpenSaveDir");
			_btnRefreshData = root.Q<Button>("BtnRefreshData");
			_maxBackupCountInput = root.Q<IntegerField>("MaxBackupCountInput");
			_backupFileList = root.Q<ScrollView>("BackupFileList");

			// [NEW] Configure AutoBackup & Threshold UI
			// Assuming UI Builder doesn't have these, we inject them or reuse existing if present.
			// For simplicity, we'll create them programmatically above BackupFileList or reuse a container.
			var configContainer = new VisualElement();
			configContainer.style.flexDirection = FlexDirection.Row;
			configContainer.style.marginBottom = 10;

			// AutoBackup Toggle
			_autoBackupToggle = new Toggle("Auto Backup");
			_autoBackupToggle.style.flexGrow = 1;
			_autoBackupToggle.RegisterValueChangedCallback(evt =>
			{
				if (KarmoToysApp.Instance.Data != null)
				{
					KarmoToysApp.Instance.Data.AutoBackupOnSave = evt.newValue;
					KarmoToysApp.Instance.SaveData(false); // Save settings
				}
			});

			// Threshold Input
			_thresholdInput = new IntegerField("Change Threshold");
			_thresholdInput.style.flexGrow = 1;
			_thresholdInput.style.marginLeft = 10;
			_thresholdInput.RegisterValueChangedCallback(evt =>
			{
				if (KarmoToysApp.Instance.Data != null)
				{
					KarmoToysApp.Instance.Data.SignificantChangeThreshold = evt.newValue;
					KarmoToysApp.Instance.SaveData(false); // Save settings
				}
			});

			// Insert above Backup List
			if (_backupFileList != null && _backupFileList.parent != null)
			{
				_backupFileList.parent.Insert(_backupFileList.parent.IndexOf(_backupFileList), configContainer);
				configContainer.Add(_autoBackupToggle);
				configContainer.Add(_thresholdInput);
			}

			_btnRunAction.clicked += RunCurrentAction;
			_btnCopyOutput.clicked += () => { GUIUtility.systemCopyBuffer = _outputField.value; };
			_btnOpenSaveDir.clicked += OnOpenSaveDir;
			_btnRefreshData.clicked += OnRefreshData;

			_maxBackupCountInput.RegisterValueChangedCallback(evt =>
			{
				if (KarmoToysApp.Instance.Data != null)
				{
					KarmoToysApp.Instance.Data.MaxBackupCount = evt.newValue;
					KarmoToysApp.Instance.SaveData();
				}
			});

			_toolSelector.RegisterValueChangedCallback(evt => SelectTool(evt.newValue));
			_actionSelector.RegisterValueChangedCallback(evt => SelectAction(evt.newValue));

			LoadTools();
		}

		public override void OnSelect()
		{
			base.OnSelect();
			RefreshBackupList();
			if (KarmoToysApp.Instance.Data != null)
			{
				_maxBackupCountInput.SetValueWithoutNotify(KarmoToysApp.Instance.Data.MaxBackupCount);
				// [NEW] Bind Config Values
				if (_autoBackupToggle != null) _autoBackupToggle.SetValueWithoutNotify(KarmoToysApp.Instance.Data.AutoBackupOnSave);
				if (_thresholdInput != null) _thresholdInput.SetValueWithoutNotify(KarmoToysApp.Instance.Data.SignificantChangeThreshold);
			}
		}

		private void RefreshBackupList()
		{
			if (_backupFileList == null) return;
			_backupFileList.Clear();

			string savePath = KarmoToysApp.Instance.GetSavePath();
			if (string.IsNullOrEmpty(savePath)) return;

			// Flat Structure: 현재 파일명 기반 필터링
			var backups = DataService.GetBackupFiles(savePath);
			foreach (var file in backups)
			{
				var row = new VisualElement();
				row.style.flexDirection = FlexDirection.Row;
				row.style.alignItems = Align.Center;
				row.style.marginBottom = 2;
				row.style.justifyContent = Justify.SpaceBetween;

				// 파일명 전체 표시 (유저 요청)
				string displayText = $"{file.Name} ({file.Length / 1024f:F1}KB)";

				var label = new Label(displayText);
				label.style.flexGrow = 1;
				label.style.color = new StyleColor(new Color(0.8f, 0.8f, 0.8f));

				var btnDiff = new Button(() => ShowDiff(file.FullName));
				btnDiff.text = "🔍";
				btnDiff.tooltip = "Compare (Diff)";
				btnDiff.style.width = 30;

				var btnLoad = new Button(() => OnClickBackupFile(file.FullName));
				btnLoad.text = "📂";
				btnLoad.tooltip = "Load this backup";
				btnLoad.style.width = 30;

				row.Add(label);
				row.Add(btnDiff);
				row.Add(btnLoad);
				_backupFileList.Add(row);
			}
		}

		private void ShowDiff(string backupPath)
		{
			if (KarmoToysApp.Instance.Data == null) return;

			// 백업 데이터 로드 (메모리 상에서만)
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
			// TODO: Confirm Popup? For now, run directly.
			KarmoToysApp.Instance.LoadBackup(path);
			RefreshBackupList();
		}

		private void LoadTools()
		{
			_tools.Clear();
			_tools.Add(new Tools.TextFormatTool());
			_tools.Add(new Tools.FileNameTool());
			_tools.Add(new Tools.YoutubeTool());

			foreach (var t in _tools)
			{
				t.Initialize(msg =>
				{
					_outputField.value = msg;
				});
			}

			_toolSelector.choices = _tools.Select(t => t.Name).ToList();
			if (_tools.Count > 0) _toolSelector.value = _tools[0].Name;
		}

		private void SelectTool(string toolName)
		{
			_currentTool = _tools.FirstOrDefault(t => t.Name == toolName);
			if (_currentTool == null) return;

			_toolTitle.text = _currentTool.Name;

			_inputMain.value = "";
			_inputSub.value = "";
			_outputField.value = "";

			var actions = _currentTool.GetActions();
			_actionSelector.choices = actions.Select(a => a.Name).ToList();
			if (actions.Count > 0) _actionSelector.value = actions[0].Name;
			else { _actionSelector.value = null; SelectAction(null); }
		}

		private void SelectAction(string actionName)
		{
			if (_currentTool == null) return;
			var actions = _currentTool.GetActions();
			_currentAction = actions.FirstOrDefault(a => a.Name == actionName);

			if (_currentAction == null)
			{
				_toolDescription.text = "";
				return;
			}

			_toolDescription.text = _currentAction.Description;
			_labelInputMain.text = _currentAction.MainInputLabel;

			if (string.IsNullOrEmpty(_currentAction.SubInputLabel))
			{
				_labelInputSub.text = "Sub Input (Not Used)";
				_inputSub.SetEnabled(false);
			}
			else
			{
				_labelInputSub.text = _currentAction.SubInputLabel;
				_inputSub.SetEnabled(true);
			}
		}

		private void RunCurrentAction()
		{
			if (_currentAction == null) return;
			try
			{
				string main = _inputMain.value;
				string sub = _inputSub.value;
				_currentAction.Execute?.Invoke(main, sub);
			}
			catch (Exception ex)
			{
				_outputField.value = $"Error: {ex.Message}";
			}
		}

		private void OnOpenSaveDir()
		{
			string dir = KarmoToysApp.Instance.GetSaveDirectory();
			if (string.IsNullOrEmpty(dir)) return;
			Application.OpenURL("file://" + dir);
			Debug.Log($"[ToolBox] Opened Dir: {dir}");
		}

		private void OnRefreshData()
		{
			KarmoToysApp.Instance.LoadData();
			// We should notify other features to refresh?
			// Since data is reloaded, references might be stale?
			// Actually KarmoToysApp.Instance.Data property is reassigned?
			// Yes.
			// Other features fetch Data via accessors (App.Instance.Data).
			// But they might need to redraw.
			// DashboardFeature, PlannerFeature have Refresh methods?
			// We don't have a global "OnDataReloaded" event yet.
			// For now, simple logging.
			Debug.Log("[ToolBox] Data Refreshed.");
		}
	}
}
