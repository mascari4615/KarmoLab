using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoLab.Module.Tools;
using System.IO;

namespace KarmoLab.Module.Planner
{
	public partial class PlannerController
	{
		// 도구 UI 요소
		private Button _tabTools;
		private ScrollView _viewTools;

		private Label _toolTitle;
		private Label _toolDescription;
		private DropdownField _toolSelector;
		private DropdownField _actionSelector;

		private Label _labelInputMain;
		private Label _labelInputSub;
		private TextField _inputMain;
		private TextField _inputSub;

		private Button _btnRunAction;
		private TextField _outputField;
		private Button _btnCopyOutput;

		private Button _btnOpenSaveDir;
		private Button _btnRefreshData;

		// 도구 로직
		private List<ITool> _tools = new();
		private ITool _currentTool;
		private ToolAction _currentAction;

		private void InitializeTools(VisualElement root)
		{
			// 1. UI 조회
			_tabTools = root.Q<Button>("TabTools");
			_viewTools = root.Q<ScrollView>("ViewTools");

			_toolTitle = root.Q<Label>("ToolTitle");
			_toolSelector = root.Q<DropdownField>("ToolSelector");
			_actionSelector = root.Q<DropdownField>("ActionSelector");
			_toolDescription = root.Q<Label>("ToolDescription");

			_labelInputMain = root.Q<Label>("LabelInputMain");
			_labelInputSub = root.Q<Label>("LabelInputSub");
			_inputMain = root.Q<TextField>("InputMain");
			_inputSub = root.Q<TextField>("InputSub");

			_btnRunAction = root.Q<Button>("BtnRunAction");
			_outputField = root.Q<TextField>("OutputField");
			_btnCopyOutput = root.Q<Button>("BtnCopyOutput");

			_btnOpenSaveDir = root.Q<Button>("BtnOpenSaveDir");
			_btnRefreshData = root.Q<Button>("BtnRefreshData");

			_btnOpenSaveDir.clicked += OnOpenSaveDir;
			_btnRefreshData.clicked += OnRefreshData;

			// 2. 도구 로드
			_tools.Clear();
			_tools.Add(new TextFormatTool());
			_tools.Add(new FileNameTool());
			_tools.Add(new YoutubeTool());

			// 로거와 함께 도구 초기화
			foreach (var tool in _tools)
			{
				tool.Initialize((msg) =>
				{
					_outputField.value = msg;
				});
			}

			// 3. 선택자 바인딩
			_toolSelector.choices = _tools.Select(t => t.Name).ToList();
			_toolSelector.RegisterValueChangedCallback(evt =>
			{
				SelectTool(evt.newValue);
			});

			_actionSelector.choices = _tools.Select(t => t.Name).ToList();
			_actionSelector.RegisterValueChangedCallback(evt =>
			{
				SelectAction(evt.newValue);
			});

			_btnRunAction.clicked += RunCurrentAction;

			// 4. 복사 버튼 바인딩
			_btnCopyOutput.clicked += () =>
			{
				if (_outputField != null) GUIUtility.systemCopyBuffer = _outputField.value;
			};

			// 5. 탭 바인딩
			_tabTools.clicked += () => SelectTab(_tabTools, _viewTools);

			// 기본 선택
			if (_tools.Count > 0)
			{
				_toolSelector.value = _tools[0].Name;
				// 값이 변경된 콜백이 이를 처리하나? 아니요, 값 할당은 버전에 따라 다르게 트리거될 수 있습니다. 루프 문제가 처리된다면 직접 호출하는 것이 더 안전함.
				// UI Toolkit 런타임에서, 값을 설정하면 보통 콜백이 트리거됨. 
			}
		}

		private void SelectTool(string toolName)
		{
			_currentTool = _tools.FirstOrDefault(t => t.Name == toolName);
			if (_currentTool == null) return;

			_toolTitle.text = _currentTool.Name;

			// 필드 초기화
			_inputMain.value = "";
			_inputSub.value = "";
			_outputField.value = "";

			// 작업 목록 채우기
			var actions = _currentTool.GetActions();
			_actionSelector.choices = actions.Select(a => a.Name).ToList();
			if (actions.Count > 0)
			{
				_actionSelector.value = actions[0].Name; // 콜백을 통해 SelectAction 트리거
			}
			else
			{
				_actionSelector.value = null;
				SelectAction(null);
			}
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

			// 메타데이터 UI 업데이트
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
			if (string.IsNullOrEmpty(_savePath)) return;
			string dir = Path.GetDirectoryName(_savePath);
			Application.OpenURL("file://" + dir);
			Debug.Log($"[Planner] Opened Save Directory: {dir}");
		}

		private void OnRefreshData()
		{
			LoadData();
			RefreshDashboard();
			RefreshSchedule();
			Debug.Log("[Planner] Data Refreshed from File.");
		}
	}
}

