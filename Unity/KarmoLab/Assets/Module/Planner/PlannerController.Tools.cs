using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoLab.Module.Tools;

namespace KarmoLab.Module.Planner
{
    public partial class PlannerController
    {
        // Tools UI Elements
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

        // Tool Logic
        private List<ITool> _tools = new();
        private ITool _currentTool;
        private ToolAction _currentAction;

        private void InitializeTools(VisualElement root)
        {
            // 1. UI Query
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

            // 2. Load Tools
            _tools.Clear();
            _tools.Add(new TextFormatTool());
            _tools.Add(new FileNameTool());
            _tools.Add(new YoutubeTool());

            // Initialize Tools with Logger
            foreach(var tool in _tools)
            {
                tool.Initialize((msg) => {
                    if (_outputField != null) _outputField.value = msg;
                });
            }

            // 3. Bind Selectors
            if (_toolSelector != null)
            {
                _toolSelector.choices = _tools.Select(t => t.Name).ToList();
                _toolSelector.RegisterValueChangedCallback(evt => {
                    SelectTool(evt.newValue);
                });
            }

            if (_actionSelector != null)
            {
                _actionSelector.RegisterValueChangedCallback(evt => {
                    SelectAction(evt.newValue);
                });
            }

            if (_btnRunAction != null)
            {
                _btnRunAction.clicked += RunCurrentAction;
            }

            // 4. Bind Copy Button
            if (_btnCopyOutput != null)
            {
                _btnCopyOutput.clicked += () => {
                    if (_outputField != null) GUIUtility.systemCopyBuffer = _outputField.value;
                };
            }

            // 5. Bind Tab
            if (_tabTools != null && _viewTools != null)
            {
                BindTab(_tabTools, _viewTools);
            }
            
            // Default Selection
             if (_tools.Count > 0 && _toolSelector != null) 
            {
                _toolSelector.value = _tools[0].Name;
                // SelectTool(_tools[0].Name); // Value changed callback handles this? No, value assignment triggers sometimes, sometimes not depending on version. Safer to call directly if loop issue is handled.
                // In UI Toolkit runtime, setting value usually triggers callback. 
            }
        }

        private void SelectTool(string toolName)
        {
            _currentTool = _tools.FirstOrDefault(t => t.Name == toolName);
            if (_currentTool == null) return;

            if (_toolTitle != null) _toolTitle.text = _currentTool.Name;
            
            // Reset Fields
            if (_inputMain != null) _inputMain.value = "";
            if (_inputSub != null) _inputSub.value = "";
            if (_outputField != null) _outputField.value = "";
            
            // Populate Actions
            var actions = _currentTool.GetActions();
            if (_actionSelector != null)
            {
                _actionSelector.choices = actions.Select(a => a.Name).ToList();
                if (actions.Count > 0)
                {
                    _actionSelector.value = actions[0].Name; // Triggers SelectAction via callback
                }
                else
                {
                     _actionSelector.value = null;
                     SelectAction(null);
                }
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

            // Update Metadata UI
            if (_toolDescription != null) _toolDescription.text = _currentAction.Description;
            
            if (_labelInputMain != null) _labelInputMain.text = _currentAction.MainInputLabel;
            if (_labelInputSub != null) 
            {
                if (string.IsNullOrEmpty(_currentAction.SubInputLabel))
                {
                    _labelInputSub.text = "Sub Input (Not Used)";
                    if(_inputSub != null) _inputSub.SetEnabled(false);
                }
                else
                {
                    _labelInputSub.text = _currentAction.SubInputLabel;
                    if(_inputSub != null) _inputSub.SetEnabled(true);
                }
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
    }
}

