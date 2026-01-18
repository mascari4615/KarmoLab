using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;
using KarmoToys.Features.ToolBox.Tools;

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

		// Logic
		private readonly List<ITool> _tools = new();
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

			_btnRunAction.clicked += RunCurrentAction;
			_btnCopyOutput.clicked += () => GUIUtility.systemCopyBuffer = _outputField.value;

			_toolSelector.RegisterValueChangedCallback(evt => SelectTool(evt.newValue));
			_actionSelector.RegisterValueChangedCallback(evt => SelectAction(evt.newValue));

			LoadTools();
		}

		public override void OnSelect() => base.OnSelect();// ToolBox specific select logic if any (none for now)

		private void LoadTools()
		{
			_tools.Clear();
			_tools.Add(new TextFormatTool());
			_tools.Add(new FileNameTool());
			_tools.Add(new YoutubeTool());

			foreach (var t in _tools)
			{
				t.Initialize(msg => _outputField.value = msg);
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

			List<ToolAction> actions = _currentTool.GetActions();
			_actionSelector.choices = actions.Select(a => a.Name).ToList();
			if (actions.Count > 0) _actionSelector.value = actions[0].Name;
			else { _actionSelector.value = null; SelectAction(null); }
		}

		private void SelectAction(string actionName)
		{
			if (_currentTool == null) return;
			List<ToolAction> actions = _currentTool.GetActions();
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

	}
}
