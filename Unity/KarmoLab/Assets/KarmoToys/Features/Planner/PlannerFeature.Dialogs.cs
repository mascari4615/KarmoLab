using System;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Main;

namespace KarmoToys.Features.Planner
{
	public partial class PlannerFeature
	{
		private ScheduleData Data => KarmoToysApp.Instance.Data?.Schedule;

		private VisualElement _detailPopup;
		private Label _detailTitle, _detailTime, _detailDesc;
		private Button _detailEditBtn, _detailDeleteBtn, _detailCloseBtn;

		private VisualElement _editOverlay;
		private TextField _editTitleInput, _editDescInput;
		private IntegerField _editStartHour, _editStartMin, _editEndHour, _editEndMin;
		private Button _editSaveBtn, _editDeleteBtn, _editCancelBtn;

		private VisualElement _editTagsContainer;
		private TextField _editTagInputField;
		private Button _editTagAddBtn;
		private List<string> _tempEditTags = new();

		private List<VisualElement> _colorBtns = new();
		private int _selectedColorIndex = 0;

		private Toggle _editRecurrenceToggle;
		private DropdownField _editRecurrenceDropdown;
		private VisualElement _recurrenceChoicePopup;
		private Button _btnRecurThis, _btnRecurFuture, _btnRecurCancel;
		private VisualElement _recurrenceWeekContainer;
		private Toggle[] _weekToggles;
		private VisualElement _recurrenceMonthContainer;
		private IntegerField _recurMonthDayInput;
		private VisualElement _recurrenceYearContainer;
		private IntegerField _recurYearMonthInput, _recurYearDayInput;
		private VisualElement _recurrenceDateInfo;
		private TextField _recurStartDate, _recurEndDate;

		private VisualElement _trashPopup;
		private ScrollView _trashList;
		private Button _trashCloseBtn, _openTrashBtn;

		private enum RecurrenceAction { None, Save, Delete, Move }
		private RecurrenceAction _pendingRecurrenceAction = RecurrenceAction.None;
		private string _pendingMoveDate;
		private int _pendingMoveStart, _pendingMoveEnd;



		private void InitializeDialogs(VisualElement root)
		{
			// Detail Popup
			_detailPopup = root.Q("DetailPopup");
			_detailTitle = root.Q<Label>("DetailTitle");
			_detailTime = root.Q<Label>("DetailTime");
			_detailDesc = root.Q<Label>("DetailDesc");

			_detailEditBtn = root.Q<Button>("DetailEditBtn");
			_detailDeleteBtn = root.Q<Button>("DetailDeleteBtn");
			_detailCloseBtn = root.Q<Button>("DetailCloseBtn");

			_detailEditBtn.clicked += () => ShowEditDialog(_selectedBlock);
			_detailDeleteBtn.clicked += OnDetailDelete;
			_detailCloseBtn.clicked += HideDetailPopup;

			// To Dismiss Detail Popup on click outside, root needs callback.
			// Assuming PlannerFeature.cs or root element handles global clicks?
			// In PlannerController, OnRootPointerDown handled it.
			// I'll register callback to ViewContainer in Init if needed, or just DetailPopup bg?
			// If ViewContainer covers screen...
			// For now, Close button is primary.

			// Edit Overlay
			_editOverlay = root.Q("EditDialogOverlay");
			_editTitleInput = root.Q<TextField>("EditTitleInput");
			_editDescInput = root.Q<TextField>("EditDescInput");

			_editStartHour = root.Q<IntegerField>("EditStartHour");
			_editStartMin = root.Q<IntegerField>("EditStartMin");
			_editEndHour = root.Q<IntegerField>("EditEndHour");
			_editEndMin = root.Q<IntegerField>("EditEndMin");

			_editSaveBtn = root.Q<Button>("EditSaveBtn");
			_editDeleteBtn = root.Q<Button>("EditDeleteBtn");
			_editCancelBtn = root.Q<Button>("EditCancelBtn");

			_editSaveBtn.clicked += OnSaveEdit;
			_editDeleteBtn.clicked += OnDeleteEdit;
			_editCancelBtn.clicked += HideEditDialog;

			_editSaveBtn.clicked += OnSaveEdit;
			_editDeleteBtn.clicked += OnDeleteEdit;
			_editCancelBtn.clicked += HideEditDialog;

			// Force full screen overlay style
			_editOverlay.style.position = Position.Absolute;
			_editOverlay.style.left = 0; _editOverlay.style.right = 0;
			_editOverlay.style.top = 0; _editOverlay.style.bottom = 0;
			_editOverlay.style.backgroundColor = new StyleColor(new Color(0, 0, 0, 0.5f));
			_editOverlay.style.justifyContent = Justify.Center;
			_editOverlay.style.alignItems = Align.Center;

			// Click background to close (check target)
			_editOverlay.RegisterCallback<PointerDownEvent>(evt =>
			{
				if (evt.target == _editOverlay) HideEditDialog();
			});

			// Colors
			_colorBtns.Clear();
			for (int i = 0; i < 5; i++)
			{
				VisualElement btn = root.Q($"ColorBtn{i}");
				if (btn != null)
				{
					int idx = i;
					btn.RegisterCallback<ClickEvent>(evt => OnColorSelected(idx));
					_colorBtns.Add(btn);
				}
			}

			// Tags
			_editTagsContainer = root.Q("EditTagsContainer");
			_editTagInputField = root.Q<TextField>("EditTagInputField");
			_editTagAddBtn = root.Q<Button>("EditTagAddBtn");
			_editTagAddBtn.clicked += () =>
			{
				AddEditTag(_editTagInputField.value); _editTagInputField.value = "";
			};
			_editTagInputField.RegisterCallback<KeyDownEvent>(evt =>
			{
				if (evt.keyCode == KeyCode.Return) { AddEditTag(_editTagInputField.value); _editTagInputField.value = ""; }
			});

			InitializeRecurrenceUI(root);
			InitializeTrash(root);

			root.RegisterCallback<PointerDownEvent>(evt =>
			{
				if (_detailPopup.style.display == DisplayStyle.Flex)
				{
					// If click target is NOT inside DetailPopup
					if (!_detailPopup.Contains(evt.target as VisualElement))
					{
						HideDetailPopup();
					}
				}
			}, TrickleDown.TrickleDown);

			// 2. Scroll to Close DetailPopup
			ScrollView scheduleScroll = root.Q<ScrollView>("ScheduleScroll");
			scheduleScroll.RegisterCallback<WheelEvent>(evt => HideDetailPopup());
		}



		private void InitializeRecurrenceUI(VisualElement root)
		{
			_editRecurrenceToggle = root.Q<Toggle>("EditRecurrenceToggle");
			_editRecurrenceDropdown = root.Q<DropdownField>("EditRecurrenceDropdown");

			_recurrenceChoicePopup = root.Q("RecurrenceChoicePopup");
			_btnRecurThis = root.Q<Button>("BtnRecurThis");
			_btnRecurFuture = root.Q<Button>("BtnRecurFuture");
			_btnRecurCancel = root.Q<Button>("BtnRecurCancel");

			_btnRecurThis.clicked += () => OnRecurrenceChoice(true);
			_btnRecurFuture.clicked += () => OnRecurrenceChoice(false);
			_btnRecurCancel.clicked += OnRecurrenceCancel;

			_recurrenceWeekContainer = root.Q("RecurrenceWeekContainer");
			_weekToggles = new Toggle[7];
			string[] days = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
			for (int i = 0; i < 7; i++)
			{
				_weekToggles[i] = root.Q<Toggle>($"Toggle{days[i]}");
			}

			_recurrenceMonthContainer = root.Q("RecurrenceMonthContainer");
			_recurMonthDayInput = root.Q<IntegerField>("RecurMonthDayInput");

			_recurrenceYearContainer = root.Q("RecurrenceYearContainer");
			_recurYearMonthInput = root.Q<IntegerField>("RecurYearMonthInput");
			_recurYearDayInput = root.Q<IntegerField>("RecurYearDayInput");

			_recurrenceDateInfo = root.Q("RecurrenceDateInfo");
			_recurStartDate = root.Q<TextField>("RecurStartDate");
			_recurEndDate = root.Q<TextField>("RecurEndDate");

			_editRecurrenceToggle.RegisterValueChangedCallback(evt => UpdateRecurrenceUI(evt.newValue));
			_editRecurrenceDropdown.RegisterValueChangedCallback(evt => UpdateRecurrenceVisibility());
		}

		private void InitializeTrash(VisualElement root)
		{
			_trashPopup = root.Q("TrashPopup");
			_trashList = root.Q<ScrollView>("TrashList");
			_trashCloseBtn = root.Q<Button>("TrashCloseBtn");
			_openTrashBtn = root.Q<Button>("OpenTrashBtn");

			_trashCloseBtn.clicked += HideTrashPopup;
			_openTrashBtn.clicked += ShowTrashPopup;
		}

		private void ShowDetailPopup(TimeBlock block)
		{
			_selectedBlock = block;

			_detailTitle.text = block.Title;
			_detailTime.text = $"{TimeStr(block.StartMinute)} - {TimeStr(block.EndMinute)}";

			string txt = string.IsNullOrEmpty(block.Description) ? "" : block.Description + "\n";
			if (block.Tags != null && block.Tags.Count > 0)
				txt += $"Tags: {string.Join(", ", block.Tags)}";
			_detailDesc.text = txt;

			_detailPopup.style.display = DisplayStyle.Flex;

			if (_detailPopup.parent == null && _timeRuler != null)
			{
				_timeRuler.Add(_detailPopup);
			}

			float top = block.EndMinute * _pixelsPerMinute; // Position at Bottom of Block

			// Calculate Left based on column
			DateTime blockDate = DateTime.Parse(block.DateString);
			int dayDiff = (blockDate - _currentDate).Days;
			if (dayDiff < 0 || dayDiff >= 7) dayDiff = 0;

			bool showWeekend = _weekendToggle?.value ?? true;
			int totalCols = showWeekend ? 7 : 5;
			if (!showWeekend && dayDiff >= 5) dayDiff = 4;

			float colWidthPercent = 100f / totalCols;
			float leftPercent = (dayDiff * colWidthPercent) + (colWidthPercent * 0.5f); // Center of column

			_detailPopup.style.top = top;
			_detailPopup.style.left = Length.Percent(leftPercent);


		}

		private void HideDetailPopup()
		{
			_detailPopup.style.display = DisplayStyle.None;
		}

		private void OnDetailDelete()
		{
			if (_selectedBlock != null && Data != null)
			{
				TimeBlock master = Data.TimeBlocks.FirstOrDefault(b => b.Id == _selectedBlock.Id);
				bool isRecurring = !string.IsNullOrEmpty(_selectedBlock.RecurrenceRule)
								   || (master != null && !string.IsNullOrEmpty(master.RecurrenceRule));

				if (isRecurring)
				{
					ShowRecurrencePopup(RecurrenceAction.Delete);
				}
				else
				{
					if (master != null)
					{
						master.IsDeleted = true;
						master.DeletedTicks = DateTime.Now.Ticks;
					}
					else
					{
						_selectedBlock.IsDeleted = true;
						_selectedBlock.DeletedTicks = DateTime.Now.Ticks;
					}
					KarmoToysApp.Instance.SaveData();
					RefreshSchedule();
					HideDetailPopup();
				}
			}
		}

		private void ShowEditDialog(TimeBlock block)
		{
			HideDetailPopup();
			if (_editOverlay == null || block == null) return;
			_selectedBlock = block;
			_selectedColorIndex = block.ColorIndex;

			_editTitleInput.value = block.Title;
			_editDescInput.value = block.Description ?? "";

			string rule = !string.IsNullOrEmpty(block.RecurrenceRule) ? block.RecurrenceRule : "";

			bool isRecur = !string.IsNullOrEmpty(rule) && rule != "None";
			_editRecurrenceToggle.value = isRecur;

			// Reset weekday toggles before parsing
			for (int i = 0; i < 7; i++)
			{
				if (_weekToggles[i] != null) _weekToggles[i].value = false;
			}

			if (isRecur)
			{
				if (rule.StartsWith("Weekly")) _editRecurrenceDropdown.value = "Weekly";
				else if (rule.StartsWith("Monthly")) _editRecurrenceDropdown.value = "Monthly";
				else if (rule.StartsWith("Yearly")) _editRecurrenceDropdown.value = "Yearly";
				ParseRecurrenceToUI(rule);
			}
			UpdateRecurrenceUI(isRecur);

			_recurStartDate.value = block.DateString;
			_recurEndDate.value = block.RecurrenceEnd ?? "";

			// Tags
			_tempEditTags.Clear();
			if (block.Tags != null) _tempEditTags.AddRange(block.Tags);
			RenderEditTags();
			_editTagInputField.value = "";

			_editStartHour.value = block.StartMinute / 60;
			_editStartMin.value = block.StartMinute % 60;
			_editEndHour.value = block.EndMinute / 60;
			_editEndMin.value = block.EndMinute % 60;

			_editDescInput.value = block.Description;

			UpdateColorSelection();
			_editOverlay.style.display = DisplayStyle.Flex;
		}

		private void ParseRecurrenceToUI(string rule)
		{
			// Reset Toggles
			foreach (Toggle t in _weekToggles) if (t != null) t.value = false;

			if (rule == "Daily")
			{
				_editRecurrenceDropdown.value = "Weekly";
				for (int i = 0; i < 7; i++) if (_weekToggles[i] != null) _weekToggles[i].value = true;
			}
			else if (rule.StartsWith("Weekly"))
			{
				_editRecurrenceDropdown.value = "Weekly";
				string[] parts = rule.Split(';');
				if (parts.Length > 1)
				{
					string[] selectedDays = parts[1].Split(',');
					string[] dayNames = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
					for (int i = 0; i < 7; i++)
					{
						if (selectedDays.Contains(dayNames[i]) && _weekToggles[i] != null)
							_weekToggles[i].value = true;
					}
				}
			}
			else if (rule.StartsWith("Monthly")) _editRecurrenceDropdown.value = "Monthly";
			else if (rule.StartsWith("Yearly")) _editRecurrenceDropdown.value = "Yearly";
		}

		private void HideEditDialog()
		{
			_editOverlay.style.display = DisplayStyle.None;
		}

		// ... Recurrence Helpers ...

		public void RequestRecurrenceMove(TimeBlock block, string newDate, int newStart, int newEnd)
		{
			_selectedBlock = block;
			_pendingMoveDate = newDate;
			_pendingMoveStart = newStart;
			_pendingMoveEnd = newEnd;
			ShowRecurrencePopup(RecurrenceAction.Move);
		}

		private void ShowRecurrencePopup(RecurrenceAction action)
		{
			_pendingRecurrenceAction = action;
			_recurrenceChoicePopup.style.display = DisplayStyle.Flex;
		}

		private void HideRecurrencePopup()
		{
			_recurrenceChoicePopup.style.display = DisplayStyle.None;
			_pendingRecurrenceAction = RecurrenceAction.None;
		}

		private void UpdateRecurrenceUI(bool isRecurring)
		{
			_editRecurrenceDropdown.style.display = isRecurring ? DisplayStyle.Flex : DisplayStyle.None;
			_recurrenceDateInfo.style.display = isRecurring ? DisplayStyle.Flex : DisplayStyle.None;
			if (isRecurring) UpdateRecurrenceVisibility();
			else
			{
				_recurrenceWeekContainer.style.display = DisplayStyle.None;
				_recurrenceMonthContainer.style.display = DisplayStyle.None;
				_recurrenceYearContainer.style.display = DisplayStyle.None;
			}
		}

		private void UpdateRecurrenceVisibility()
		{
			string value = _editRecurrenceDropdown.value;
			_recurrenceWeekContainer.style.display = (value != null && value.StartsWith("Weekly")) ? DisplayStyle.Flex : DisplayStyle.None;
			_recurrenceMonthContainer.style.display = (value != null && value.StartsWith("Monthly")) ? DisplayStyle.Flex : DisplayStyle.None;
			_recurrenceYearContainer.style.display = (value != null && value.StartsWith("Yearly")) ? DisplayStyle.Flex : DisplayStyle.None;
		}

		private void OnRecurrenceCancel()
		{
			HideRecurrencePopup();
			RefreshSchedule();
		}

		private void OnRecurrenceChoice(bool isThisInstanceOnly)
		{
			if (Data == null || _selectedBlock == null) { HideRecurrencePopup(); return; }
			TimeBlock masterBlock = Data.TimeBlocks.FirstOrDefault(b => b.Id == _selectedBlock.Id);
			if (masterBlock == null) { HideRecurrencePopup(); return; }

			if (_pendingRecurrenceAction == RecurrenceAction.Delete)
			{
				if (isThisInstanceOnly)
				{
					if (masterBlock.ExceptionDates == null) masterBlock.ExceptionDates = new List<string>();
					masterBlock.ExceptionDates.Add(_selectedBlock.DateString);
				}
				else
				{
					DateTime targetDate = DateTime.Parse(_selectedBlock.DateString);
					masterBlock.RecurrenceEnd = targetDate.AddDays(-1).ToString("yyyy-MM-dd");
				}
			}
			else if (_pendingRecurrenceAction == RecurrenceAction.Save)
			{
				// Edit Logic...
				// Creating new blocks...
				// For now, simple implementation to close flow:
				if (isThisInstanceOnly)
				{
					masterBlock.ExceptionDates ??= new List<string>();
					masterBlock.ExceptionDates.Add(_selectedBlock.DateString);
					TimeBlock newBlock = CreateBlockFromUI();
					newBlock.RecurrenceRule = "";
					Data.TimeBlocks.Add(newBlock);
				}
				else
				{
					DateTime targetDate = DateTime.Parse(_selectedBlock.DateString);
					masterBlock.RecurrenceEnd = targetDate.AddDays(-1).ToString("yyyy-MM-dd");
					TimeBlock newMaster = CreateBlockFromUI();
					Data.TimeBlocks.Add(newMaster);
				}
			}
			else if (_pendingRecurrenceAction == RecurrenceAction.Move)
			{
				if (isThisInstanceOnly)
				{
					masterBlock.ExceptionDates ??= new List<string>();
					masterBlock.ExceptionDates.Add(_selectedBlock.DateString);
					TimeBlock newBlock = new TimeBlock(_pendingMoveDate, _pendingMoveStart, _pendingMoveEnd, masterBlock.Title)
					{
						ColorIndex = masterBlock.ColorIndex
					};
					Data.TimeBlocks.Add(newBlock);
				}
				else
				{
					DateTime targetDate = DateTime.Parse(_selectedBlock.DateString);
					masterBlock.RecurrenceEnd = targetDate.AddDays(-1).ToString("yyyy-MM-dd");
					TimeBlock newMaster = new TimeBlock(_pendingMoveDate, _pendingMoveStart, _pendingMoveEnd, masterBlock.Title)
					{
						RecurrenceRule = masterBlock.RecurrenceRule,
						ColorIndex = masterBlock.ColorIndex
					};
					Data.TimeBlocks.Add(newMaster);
				}
			}

			KarmoToysApp.Instance.SaveData();
			RefreshSchedule();
			HideEditDialog();
			HideDetailPopup();
			HideRecurrencePopup();
		}


		private void ShowTrashPopup()
		{
			RenderTrashList();
			_trashPopup.style.display = DisplayStyle.Flex;
		}
		private void HideTrashPopup() => _trashPopup.style.display = DisplayStyle.None;

		private void RenderTrashList()
		{
			if (_trashList == null || Data == null) return;
			_trashList.Clear();
			List<TimeBlock> deletedBlocks = Data.TimeBlocks.Where(b => b.IsDeleted).OrderByDescending(b => b.DeletedTicks).ToList();
			if (deletedBlocks.Count == 0)
			{
				_trashList.Add(new Label("Trash is empty.") { style = { color = Color.gray } });
				return;
			}
			foreach (TimeBlock block in deletedBlocks)
			{
				VisualElement row = new VisualElement();
				row.Add(new Label(block.Title));
				Button resBtn = new Button(() =>
				{
					block.IsDeleted = false;
					KarmoToysApp.Instance.SaveData();
					RenderTrashList();
					RefreshSchedule();
				})
				{ text = "Restore" };
				row.Add(resBtn);
				_trashList.Add(row);
			}
		}

		private void OnSaveEdit()
		{
			if (_selectedBlock == null) return;
			// Calc UI values
			string title = _editTitleInput.value;
			// ...
			// Update _selectedBlock

			// Check Transient... RecurrenceAction.Save...
			// Simplified:
			if (Data != null && !Data.TimeBlocks.Contains(_selectedBlock))
			{
				ShowRecurrencePopup(RecurrenceAction.Save);
				return;
			}

			_selectedBlock.Title = title;
			_selectedBlock.Description = _editDescInput.value;

			// Time
			int startM = _editStartHour.value * 60 + _editStartMin.value;
			int endM = _editEndHour.value * 60 + _editEndMin.value;
			if (endM <= startM) endM = startM + 60; // Minimum duration

			_selectedBlock.StartMinute = startM;
			_selectedBlock.EndMinute = endM;

			// Color
			_selectedBlock.ColorIndex = _selectedColorIndex;

			// Tags
			_selectedBlock.Tags = new List<string>(_tempEditTags);

			// Recurrence
			_selectedBlock.RecurrenceRule = GetRecurrenceRuleFromUI();

			_selectedBlock.RecurrenceRule = GetRecurrenceRuleFromUI();


			KarmoToysApp.Instance.SaveData();
			RefreshSchedule();
			HideEditDialog();
		}

		private void OnDeleteEdit()
		{
			if (_selectedBlock == null) return;
			if (Data != null && !Data.TimeBlocks.Contains(_selectedBlock)) { ShowRecurrencePopup(RecurrenceAction.Delete); return; }
			if (Data != null) Data.TimeBlocks.Remove(_selectedBlock);
			KarmoToysApp.Instance.SaveData();
			RefreshSchedule();
			HideEditDialog();
			HideDetailPopup();
		}

		private TimeBlock CreateBlockFromUI()
		{
			// Get all data from UI
			string dateStr = _recurStartDate.value;
			if (string.IsNullOrEmpty(dateStr)) dateStr = _selectedBlock?.DateString ?? DateTime.Now.ToString("yyyy-MM-dd");

			int startM = _editStartHour.value * 60 + _editStartMin.value;
			int endM = _editEndHour.value * 60 + _editEndMin.value;
			if (endM <= startM) endM = startM + 60;

			string title = _editTitleInput.value;
			if (string.IsNullOrEmpty(title)) title = "Untitled";

			TimeBlock b = new TimeBlock(dateStr, startM, endM, title);
			b.Description = _editDescInput.value;
			b.Tags = new List<string>(_tempEditTags);
			b.ColorIndex = _selectedColorIndex;
			b.RecurrenceRule = GetRecurrenceRuleFromUI();
			b.RecurrenceEnd = _recurEndDate.value;

			return b;
		}

		private string GetRecurrenceRuleFromUI()
		{
			if (!_editRecurrenceToggle.value) return "";

			string rule = _editRecurrenceDropdown.value;
			if (rule == "Weekly")
			{
				List<string> days = new List<string>();
				string[] dayNames = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
				for (int i = 0; i < 7; i++)
				{
					if (_weekToggles[i].value) days.Add(dayNames[i]);
				}
				if (days.Count > 0) rule += ";" + string.Join(",", days);
			}
			else if (rule == "Monthly")
			{
				rule += $";{_recurMonthDayInput.value}";
			}
			else if (rule == "Yearly")
			{
				rule += $";{_recurYearMonthInput.value}-{_recurYearDayInput.value}";
			}

			return rule;
		}

		private void OnColorSelected(int index)
		{
			_selectedColorIndex = index;
			UpdateColorSelection();
		}

		private void UpdateColorSelection()
		{
			for (int i = 0; i < _colorBtns.Count; i++)
			{
				Color c = (i == _selectedColorIndex) ? Color.white : Color.clear;
				_colorBtns[i].style.borderTopColor = new StyleColor(c);
				_colorBtns[i].style.borderBottomColor = new StyleColor(c);
				_colorBtns[i].style.borderLeftColor = new StyleColor(c);
				_colorBtns[i].style.borderRightColor = new StyleColor(c);
			}
		}

		private void AddEditTag(string tag)
		{
			if (!_tempEditTags.Contains(tag))
			{
				_tempEditTags.Add(tag); RenderEditTags();
			}
		}

		private void RemoveEditTag(string tag)
		{
			if (_tempEditTags.Contains(tag))
			{
				_tempEditTags.Remove(tag); RenderEditTags();
			}
		}

		private void RenderEditTags()
		{
			_editTagsContainer.Clear();
			foreach (string t in _tempEditTags)
			{
				Label el = new Label(t);
				el.RegisterCallback<ClickEvent>(evt => RemoveEditTag(t)); // Click to remove
				_editTagsContainer.Add(el);
			}
		}
	}
}
