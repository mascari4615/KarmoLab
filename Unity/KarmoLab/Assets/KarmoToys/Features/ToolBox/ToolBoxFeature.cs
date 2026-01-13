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

			if (_btnRunAction != null) _btnRunAction.clicked += RunCurrentAction;
			if (_btnCopyOutput != null) _btnCopyOutput.clicked += () => { if (_outputField != null) GUIUtility.systemCopyBuffer = _outputField.value; };
			if (_btnOpenSaveDir != null) _btnOpenSaveDir.clicked += OnOpenSaveDir;
			if (_btnRefreshData != null) _btnRefreshData.clicked += OnRefreshData;

			if (_toolSelector != null) _toolSelector.RegisterValueChangedCallback(evt => SelectTool(evt.newValue));
			if (_actionSelector != null) _actionSelector.RegisterValueChangedCallback(evt => SelectAction(evt.newValue));

			LoadTools();
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
					if (_outputField != null) _outputField.value = msg;
				});
			}

			if (_toolSelector != null) _toolSelector.choices = _tools.Select(t => t.Name).ToList();
			if (_tools.Count > 0 && _toolSelector != null) _toolSelector.value = _tools[0].Name;
		}

		private void SelectTool(string toolName)
		{
			_currentTool = _tools.FirstOrDefault(t => t.Name == toolName);
			if (_currentTool == null) return;

			if (_toolTitle != null) _toolTitle.text = _currentTool.Name;

			if (_inputMain != null) _inputMain.value = "";
			if (_inputSub != null) _inputSub.value = "";
			if (_outputField != null) _outputField.value = "";

			var actions = _currentTool.GetActions();
			if (_actionSelector != null)
			{
				_actionSelector.choices = actions.Select(a => a.Name).ToList();
				if (actions.Count > 0) _actionSelector.value = actions[0].Name;
				else { _actionSelector.value = null; SelectAction(null); }
			}
		}

		private void SelectAction(string actionName)
		{
			if (_currentTool == null) return;
			var actions = _currentTool.GetActions();
			_currentAction = actions.FirstOrDefault(a => a.Name == actionName);

			if (_currentAction == null)
			{
				if (_toolDescription != null) _toolDescription.text = "";
				return;
			}

			if (_toolDescription != null) _toolDescription.text = _currentAction.Description;
			if (_labelInputMain != null) _labelInputMain.text = _currentAction.MainInputLabel;

			if (string.IsNullOrEmpty(_currentAction.SubInputLabel))
			{
				if (_labelInputSub != null) _labelInputSub.text = "Sub Input (Not Used)";
				if (_inputSub != null) _inputSub.SetEnabled(false);
			}
			else
			{
				if (_labelInputSub != null) _labelInputSub.text = _currentAction.SubInputLabel;
				if (_inputSub != null) _inputSub.SetEnabled(true);
			}
		}

		private void RunCurrentAction()
		{
			if (_currentAction == null) return;
			try
			{
				string main = _inputMain != null ? _inputMain.value : "";
				string sub = _inputSub != null ? _inputSub.value : "";
				_currentAction.Execute?.Invoke(main, sub);
			}
			catch (Exception ex)
			{
				if (_outputField != null) _outputField.value = $"Error: {ex.Message}";
			}
		}

		private void OnOpenSaveDir()
		{
			string path = Define.EditorDataPath;
			if (string.IsNullOrEmpty(path)) return;
			string dir = Path.GetDirectoryName(path);
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
