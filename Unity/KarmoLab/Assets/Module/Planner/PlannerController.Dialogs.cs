using System;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoLab.Module.Planner
{
	public partial class PlannerController
	{
		// --- 오버레이 및 팝업 로직 ---

		private void OnRootPointerDown(PointerDownEvent evt)
		{
			if (_detailPopup != null && _detailPopup.style.display == DisplayStyle.Flex)
			{
				VisualElement target = evt.target as VisualElement;
				if (!IsDescendant(_detailPopup, target))
				{
					HideDetailPopup();
				}
			}
		}

		private bool IsDescendant(VisualElement parent, VisualElement child)
		{
			while (child != null)
			{
				if (child == parent) return true;
				child = child.parent;
			}
			return false;
		}



		private void ShowDetailPopup(TimeBlock block, VisualElement visualBlock)
		{
			if (_detailPopup == null) return;
			_selectedBlock = block;

			if (_detailTitle != null) _detailTitle.text = block.Title;
			if (_detailTime != null) _detailTime.text = $"{TimeStr(block.StartMinute)} - {TimeStr(block.EndMinute)}";
			if (_detailDesc != null)
			{
				string txt = string.IsNullOrEmpty(block.Description) ? "" : block.Description + "\n";
				if (block.Tags != null && block.Tags.Count > 0)
					txt += $"Tags: {string.Join(", ", block.Tags)}";
				_detailDesc.text = txt;
			}

			// 휴지통에 있는 경우 "영구 삭제" 또는 "복구" 버튼으로 변경 가능 (선택 사항)
			// 여기서는 일단 "삭제" 버튼만 구현

			_detailPopup.style.display = DisplayStyle.Flex;

			// ... (Positioning logic remains the same)
			// 위치 계산 로직
			if (visualBlock.parent != null && _detailPopup.parent != null)
			{
				Vector2 targetPos = visualBlock.ChangeCoordinatesTo(_detailPopup.parent, new Vector2(visualBlock.contentRect.width - 10, 5));

				float rootWidth = _detailPopup.parent.contentRect.width;
				if (targetPos.x + 220 > rootWidth)
					targetPos.x = targetPos.x - 220 - 20;

				_detailPopup.style.left = targetPos.x;
				_detailPopup.style.top = targetPos.y;
			}
		}

		private void OnDetailDelete()
		{
			Debug.Log("[Planner] OnDetailDelete called");
			if (_selectedBlock != null)
			{
				// Check if it's a recurring block (or part of one)
				// Transient blocks should have RecurrenceRule copied, or we find Master
				var master = _data.TimeBlocks.FirstOrDefault(b => b.Id == _selectedBlock.Id);
				bool isRecurring = !string.IsNullOrEmpty(_selectedBlock.RecurrenceRule)
								   || (master != null && !string.IsNullOrEmpty(master.RecurrenceRule));

				if (isRecurring)
				{
					// Show Recurrence Choice for Delete
					ShowRecurrencePopup(RecurrenceAction.Delete);
				}
				else
				{
					// Normal Delete
					if (master != null)
					{
						master.IsDeleted = true;
						master.DeletedTicks = DateTime.Now.Ticks;
					}
					else
					{
						// Maybe _selectedBlock IS the master (if not transient)
						_selectedBlock.IsDeleted = true;
						_selectedBlock.DeletedTicks = DateTime.Now.Ticks;
					}

					Debug.Log($"[Planner] Soft deleted: {_selectedBlock.Title}");
					SaveData();
					RefreshSchedule();
					HideDetailPopup();
				}
			}
		}

		private void HideDetailPopup()
		{
			if (_detailPopup != null) _detailPopup.style.display = DisplayStyle.None;
		}

		private void ShowEditDialog(TimeBlock block)
		{
			HideDetailPopup();
			if (_editOverlay == null || block == null) return;
			_selectedBlock = block;
			_selectedColorIndex = block.ColorIndex;

			if (_editTitleInput != null) _editTitleInput.value = block.Title;

			// Recurrence
			if (_editRecurrenceToggle != null && _editRecurrenceDropdown != null)
			{
				string rule = !string.IsNullOrEmpty(block.RecurrenceRule) ? block.RecurrenceRule : "";

				if (string.IsNullOrEmpty(rule) || rule == "None")
				{
					_editRecurrenceToggle.value = false;
					_editRecurrenceDropdown.value = "Weekly"; // Default
					UpdateRecurrenceUI(false);
				}
				else
				{
					_editRecurrenceToggle.value = true;
					// UpdateRecurrenceUI(true) will be called by toggle, but we set fields first

					// Parse Rule
					if (rule == "Daily")
					{
						_editRecurrenceDropdown.value = "Weekly";
						for (int i = 0; i < 7; i++) if (_weekToggles[i] != null) _weekToggles[i].value = true;
					}
					else if (rule.StartsWith("Weekly"))
					{
						_editRecurrenceDropdown.value = "Weekly";

						var parts = rule.Split(';');
						if (parts.Length > 1)
						{
							var dayIndices = parts[1].Split(',').Select(s => int.Parse(s)).ToList();
							for (int i = 0; i < 7; i++)
							{
								if (_weekToggles[i] != null) _weekToggles[i].value = dayIndices.Contains(i);
							}
						}
						else
						{
							// Legacy "Weekly"
							DateTime date = DateTime.Parse(block.DateString);
							int dayIdx = (int)date.DayOfWeek;
							for (int i = 0; i < 7; i++)
							{
								if (_weekToggles[i] != null) _weekToggles[i].value = (i == dayIdx);
							}
						}
					}
					else if (rule.StartsWith("Monthly"))
					{
						_editRecurrenceDropdown.value = "Monthly";
						int d = 1;
						var parts = rule.Split(';');
						foreach (var p in parts)
						{
							if (p.StartsWith("Day:")) int.TryParse(p.Substring(4), out d);
						}
						if (d < 1) d = 1;
						if (_recurMonthDayInput != null) _recurMonthDayInput.value = d;
					}
					else if (rule.StartsWith("Yearly"))
					{
						_editRecurrenceDropdown.value = "Yearly";
						int m = 1, d = 1;
						var parts = rule.Split(';');
						foreach (var p in parts)
						{
							if (p.StartsWith("Month:")) int.TryParse(p.Substring(6), out m);
							if (p.StartsWith("Day:")) int.TryParse(p.Substring(4), out d);
						}
						if (_recurYearMonthInput != null) _recurYearMonthInput.value = m;
						if (_recurYearDayInput != null) _recurYearDayInput.value = d;
					}

					UpdateRecurrenceUI(true);
				}

				if (_recurStartDate != null) _recurStartDate.value = block.DateString;
				if (_recurEndDate != null) _recurEndDate.value = block.RecurrenceEnd ?? "";
			}

			// 태그
			if (_tempEditTags != null) // Safety check
			{
				_tempEditTags.Clear();
				if (block.Tags != null) _tempEditTags.AddRange(block.Tags);
				RenderEditTags();
			}
			if (_editTagInputField != null) _editTagInputField.value = "";

			// 시간 변환
			if (_editStartHour != null) _editStartHour.value = block.StartMinute / 60;
			if (_editStartMin != null) _editStartMin.value = block.StartMinute % 60;
			if (_editEndHour != null) _editEndHour.value = block.EndMinute / 60;
			if (_editEndMin != null) _editEndMin.value = block.EndMinute % 60;

			if (_editDescInput != null) _editDescInput.value = block.Description;

			UpdateColorSelection();

			_editOverlay.style.display = DisplayStyle.Flex;
		}

		private void HideEditDialog()
		{
			if (_editOverlay != null) _editOverlay.style.display = DisplayStyle.None;
		}


		// Recurrence Dates
		private TextField _recurStartDate;
		private TextField _recurEndDate;
		private VisualElement _recurrenceDateInfo; // Container for dates

		// --- Recurrence Logic ---
		private Toggle _editRecurrenceToggle; // New Toggle
		private DropdownField _editRecurrenceDropdown;
		private VisualElement _recurrenceChoicePopup;
		private Button _btnRecurThis;
		private Button _btnRecurFuture;
		private Button _btnRecurCancel;

		// Weekly UI
		private VisualElement _recurrenceWeekContainer;
		private Toggle[] _weekToggles;

		// Monthly UI
		private VisualElement _recurrenceMonthContainer;
		private IntegerField _recurMonthDayInput;

		// Yearly UI
		private VisualElement _recurrenceYearContainer;
		private IntegerField _recurYearMonthInput;
		private IntegerField _recurYearDayInput;

		// Action State
		private enum RecurrenceAction { None, Save, Delete, Move }
		private RecurrenceAction _pendingRecurrenceAction = RecurrenceAction.None;

		// Pending Move State
		private string _pendingMoveDate;
		private int _pendingMoveStart;
		private int _pendingMoveEnd;

		private void InitializeRecurrenceUI(VisualElement root)
		{
			_editRecurrenceToggle = root.Q<Toggle>("EditRecurrenceToggle");
			_editRecurrenceDropdown = root.Q<DropdownField>("EditRecurrenceDropdown");

			_recurrenceChoicePopup = root.Q("RecurrenceChoicePopup");
			_btnRecurThis = root.Q<Button>("BtnRecurThis");
			_btnRecurFuture = root.Q<Button>("BtnRecurFuture");
			_btnRecurCancel = root.Q<Button>("BtnRecurCancel");

			if (_btnRecurThis != null) _btnRecurThis.clicked += () => OnRecurrenceChoice(true); // This Only
			if (_btnRecurFuture != null) _btnRecurFuture.clicked += () => OnRecurrenceChoice(false); // All Future
			if (_btnRecurCancel != null) _btnRecurCancel.clicked += OnRecurrenceCancel;

			// Week Toggles
			_recurrenceWeekContainer = root.Q("RecurrenceWeekContainer");
			if (_recurrenceWeekContainer == null) Debug.LogError("RecurrenceWeekContainer not found!");

			_weekToggles = new Toggle[7];
			string[] days = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
			for (int i = 0; i < 7; i++)
			{
				_weekToggles[i] = root.Q<Toggle>($"Toggle{days[i]}");
				if (_weekToggles[i] == null) Debug.LogError($"Toggle{days[i]} not found!");
				else _weekToggles[i].RegisterValueChangedCallback(evt => Debug.Log($"Toggle {i} changed to {evt.newValue}"));
			}

			// Monthly/Yearly UI
			_recurrenceMonthContainer = root.Q("RecurrenceMonthContainer");
			_recurMonthDayInput = root.Q<IntegerField>("RecurMonthDayInput");

			_recurrenceYearContainer = root.Q("RecurrenceYearContainer");
			_recurYearMonthInput = root.Q<IntegerField>("RecurYearMonthInput");
			_recurYearDayInput = root.Q<IntegerField>("RecurYearDayInput");

			// Dates
			_recurrenceDateInfo = root.Q("RecurrenceDateInfo");
			_recurStartDate = root.Q<TextField>("RecurStartDate");
			_recurEndDate = root.Q<TextField>("RecurEndDate");

			if (_editRecurrenceToggle != null)
			{
				_editRecurrenceToggle.RegisterValueChangedCallback(evt => UpdateRecurrenceUI(evt.newValue));
			}
			if (_editRecurrenceDropdown != null)
			{
				_editRecurrenceDropdown.RegisterValueChangedCallback(evt => UpdateRecurrenceVisibility());
			}
		}

		private void UpdateRecurrenceUI(bool isRecurring)
		{
			if (_editRecurrenceDropdown != null) _editRecurrenceDropdown.style.display = isRecurring ? DisplayStyle.Flex : DisplayStyle.None;
			if (_recurrenceDateInfo != null) _recurrenceDateInfo.style.display = isRecurring ? DisplayStyle.Flex : DisplayStyle.None;

			if (isRecurring)
			{
				UpdateRecurrenceVisibility();
			}
			else
			{
				// Hide everything else
				if (_recurrenceWeekContainer != null) _recurrenceWeekContainer.style.display = DisplayStyle.None;
				if (_recurrenceMonthContainer != null) _recurrenceMonthContainer.style.display = DisplayStyle.None;
				if (_recurrenceYearContainer != null) _recurrenceYearContainer.style.display = DisplayStyle.None;
			}
		}

		private void UpdateRecurrenceVisibility()
		{
			string value = _editRecurrenceDropdown != null ? _editRecurrenceDropdown.value : "";

			if (_recurrenceWeekContainer != null)
				_recurrenceWeekContainer.style.display = value.StartsWith("Weekly") ? DisplayStyle.Flex : DisplayStyle.None;

			if (_recurrenceMonthContainer != null)
				_recurrenceMonthContainer.style.display = value.StartsWith("Monthly") ? DisplayStyle.Flex : DisplayStyle.None;

			if (_recurrenceYearContainer != null)
				_recurrenceYearContainer.style.display = value.StartsWith("Yearly") ? DisplayStyle.Flex : DisplayStyle.None;
		}

		private void UpdateRecurrenceUI(string value)
		{
			// Legacy method signature support or forwarder
			// Does nothing since we use bool now for main switch.
			// But callback from Dropdown calls UpdateRecurrenceVisibility.
			UpdateRecurrenceVisibility();
		}

		private void OnRecurrenceCancel()
		{
			HideRecurrencePopup();
			RefreshSchedule(); // Revert any optimistic changes (Resize, opacity, etc.)
		}

		private void ShowRecurrencePopup(RecurrenceAction action)
		{
			if (_recurrenceChoicePopup == null) return;
			_pendingRecurrenceAction = action;
			_recurrenceChoicePopup.style.display = DisplayStyle.Flex;
		}

		public void RequestRecurrenceMove(TimeBlock block, string newDate, int newStart, int newEnd)
		{
			_selectedBlock = block;
			_pendingMoveDate = newDate;
			_pendingMoveStart = newStart;
			_pendingMoveEnd = newEnd;
			ShowRecurrencePopup(RecurrenceAction.Move);
		}

		private void HideRecurrencePopup()
		{
			if (_recurrenceChoicePopup != null) _recurrenceChoicePopup.style.display = DisplayStyle.None;
			_pendingRecurrenceAction = RecurrenceAction.None;
		}

		private void OnRecurrenceChoice(bool isThisInstanceOnly)
		{
			// HideRecurrencePopup(); // Move to end or ensure it doesn't kill execution? No, it just hides UI.
			Debug.Log($"[Planner] OnRecurrenceChoice: {isThisInstanceOnly}, Action: {_pendingRecurrenceAction}");

			// Find Master Block
			var masterBlock = _data.TimeBlocks.FirstOrDefault(b => b.Id == _selectedBlock.Id);
			if (masterBlock == null)
			{
				Debug.LogError($"[Planner] Master block not found for ID: {_selectedBlock.Id}");
				HideRecurrencePopup();
				return;
			}
			Debug.Log($"[Planner] Master Block Found: {masterBlock.Title} ({masterBlock.DateString}), Rule: {masterBlock.RecurrenceRule}");

			if (_pendingRecurrenceAction == RecurrenceAction.Delete)
			{
				if (isThisInstanceOnly)
				{
					// [Delete This] -> Add Exception
					if (masterBlock.ExceptionDates == null) masterBlock.ExceptionDates = new List<string>();
					masterBlock.ExceptionDates.Add(_selectedBlock.DateString);
					Debug.Log($"[Planner] Added Exception Date: {_selectedBlock.DateString}");
				}
				else
				{
					// [Delete Future] -> End Recurrence Yesterday
					DateTime targetDate = DateTime.Parse(_selectedBlock.DateString);
					masterBlock.RecurrenceEnd = targetDate.AddDays(-1).ToString("yyyy-MM-dd");
					Debug.Log($"[Planner] Set RecurrenceEnd: {masterBlock.RecurrenceEnd}");
				}
			}
			else if (_pendingRecurrenceAction == RecurrenceAction.Save)
			{
				if (isThisInstanceOnly)
				{
					// [Edit This]
					if (masterBlock.ExceptionDates == null) masterBlock.ExceptionDates = new List<string>();
					masterBlock.ExceptionDates.Add(_selectedBlock.DateString);

					var newBlock = CreateBlockFromUI(); // Reads Date from UI
					newBlock.RecurrenceRule = ""; // Break recurrence
					_data.TimeBlocks.Add(newBlock);
					Debug.Log($"[Planner] Created Independent Block: {newBlock.Title} at {newBlock.DateString}");
				}
				else
				{
					// [Edit Future]
					DateTime targetDate = DateTime.Parse(_selectedBlock.DateString);
					// End old recurrence at day before target (or day before New Start Date? logic complex)
					// Standard behavior: End old series just before the Split Point.
					masterBlock.RecurrenceEnd = targetDate.AddDays(-1).ToString("yyyy-MM-dd");

					var newMaster = CreateBlockFromUI(); // Reads Date from UI as new start
					_data.TimeBlocks.Add(newMaster);
					Debug.Log($"[Planner] Created New Master: {newMaster.Title} starting {newMaster.DateString}");
				}
			}
			else if (_pendingRecurrenceAction == RecurrenceAction.Move)
			{
				if (isThisInstanceOnly)
				{
					if (masterBlock.ExceptionDates == null) masterBlock.ExceptionDates = new List<string>();
					masterBlock.ExceptionDates.Add(_selectedBlock.DateString);
					Debug.Log($"[Planner] Move This: Exception added for {_selectedBlock.DateString}");

					var newBlock = new TimeBlock(_pendingMoveDate, _pendingMoveStart, _pendingMoveEnd, masterBlock.Title);
					newBlock.Description = masterBlock.Description;
					newBlock.Tags = new List<string>(masterBlock.Tags);
					newBlock.ColorIndex = masterBlock.ColorIndex;
					newBlock.RecurrenceRule = "";
					_data.TimeBlocks.Add(newBlock);
				}
				else
				{
					DateTime targetDate = DateTime.Parse(_selectedBlock.DateString);
					masterBlock.RecurrenceEnd = targetDate.AddDays(-1).ToString("yyyy-MM-dd");
					Debug.Log($"[Planner] Move Future: Ended Old Master at {masterBlock.RecurrenceEnd}");

					var newMaster = new TimeBlock(_pendingMoveDate, _pendingMoveStart, _pendingMoveEnd, masterBlock.Title);
					newMaster.Description = masterBlock.Description;
					newMaster.Tags = new List<string>(masterBlock.Tags);
					newMaster.ColorIndex = masterBlock.ColorIndex;
					newMaster.RecurrenceRule = masterBlock.RecurrenceRule;
					_data.TimeBlocks.Add(newMaster);
					Debug.Log($"[Planner] Move Future: Created New Master at {_pendingMoveDate}");
				}
			}

			SaveData();
			RefreshSchedule();
			HideEditDialog();
			HideDetailPopup();
			HideRecurrencePopup();
		}

		// Helper to create block from current UI values
		private TimeBlock CreateBlockFromUI()
		{
			// Time Calculation
			int startH = _editStartHour != null ? _editStartHour.value : 0;
			int startM = _editStartMin != null ? _editStartMin.value : 0;
			int endH = _editEndHour != null ? _editEndHour.value : 0;
			int endM = _editEndMin != null ? _editEndMin.value : 0;
			int startTotal = Mathf.Clamp(startH * 60 + startM, 0, 1440);
			int endTotal = Mathf.Clamp(endH * 60 + endM, 0, 1440);
			if (endTotal <= startTotal) endTotal = startTotal + 30;

			string title = _editTitleInput != null ? _editTitleInput.value : "No Title";

			var block = new TimeBlock("temp", startTotal, endTotal, title);
			block.Description = _editDescInput != null ? _editDescInput.value : "";
			block.Tags = new List<string>(_tempEditTags);
			block.ColorIndex = _selectedColorIndex;

			// Recurrence from Dropdown (Use Helper)
			block.RecurrenceRule = GetRecurrenceRuleFromUI();
			block.RecurrenceEnd = _recurEndDate != null ? _recurEndDate.value.Trim() : "";

			// Date String
			if (_recurStartDate != null && !string.IsNullOrWhiteSpace(_recurStartDate.value))
			{
				block.DateString = _recurStartDate.value.Trim();
			}

			return block;
		}


		private string GetRecurrenceRuleFromUI()
		{
			if (_editRecurrenceToggle != null && !_editRecurrenceToggle.value) return ""; // Not recurring
			if (_editRecurrenceDropdown == null) return "None"; // Should not happen if toggle is on

			string r = _editRecurrenceDropdown.value;
			if (string.IsNullOrEmpty(r)) return "";

			if (r == "Weekly")
			{
				List<int> selectedDays = new List<int>();
				for (int i = 0; i < 7; i++)
				{
					if (_weekToggles[i] != null && _weekToggles[i].value) selectedDays.Add(i);
				}

				if (selectedDays.Count > 0)
				{
					return $"Weekly;{string.Join(",", selectedDays)}";
				}
				else
				{
					return "Weekly";
				}
			}
			else if (r == "Monthly")
			{
				int d = _recurMonthDayInput != null ? _recurMonthDayInput.value : 1;
				return $"Monthly;Day:{d}";
			}
			else if (r == "Yearly")
			{
				int m = _recurYearMonthInput != null ? _recurYearMonthInput.value : 1;
				int d = _recurYearDayInput != null ? _recurYearDayInput.value : 1;
				return $"Yearly;Month:{m};Day:{d}";
			}

			return r;
		}

		private void OnSaveEdit()
		{
			if (_selectedBlock == null) return;

			// Calculate UI Values first
			int startH = _editStartHour != null ? _editStartHour.value : 0;
			int startM = _editStartMin != null ? _editStartMin.value : 0;
			int endH = _editEndHour != null ? _editEndHour.value : 0;
			int endM = _editEndMin != null ? _editEndMin.value : 0;
			int startTotal = Mathf.Clamp(startH * 60 + startM, 0, 1440);
			int endTotal = Mathf.Clamp(endH * 60 + endM, 0, 1440);
			if (endTotal <= startTotal) endTotal = startTotal + 30;

			string title = _editTitleInput != null ? _editTitleInput.value : "No Title";
			string desc = _editDescInput != null ? _editDescInput.value : "";

			// FIX: Use helper to get complex rule string
			string recur = GetRecurrenceRuleFromUI();
			string recurEnd = _recurEndDate != null ? _recurEndDate.value.Trim() : "";
			string dateStr = _recurStartDate != null ? _recurStartDate.value.Trim() : _selectedBlock.DateString;

			int colorIdx = _selectedColorIndex;

			// Check Changes
			bool tagsChanged = false;
			if (_selectedBlock.Tags == null && _tempEditTags.Count > 0) tagsChanged = true;
			else if (_selectedBlock.Tags != null && _selectedBlock.Tags.Count != _tempEditTags.Count) tagsChanged = true;
			else if (_selectedBlock.Tags != null)
			{
				for (int i = 0; i < _selectedBlock.Tags.Count; i++)
					if (_selectedBlock.Tags[i] != _tempEditTags[i]) { tagsChanged = true; break; }
			}

			if (!tagsChanged &&
				_selectedBlock.Title == title &&
				_selectedBlock.Description == desc &&
				_selectedBlock.RecurrenceRule == recur &&
				_selectedBlock.RecurrenceEnd == recurEnd &&
				_selectedBlock.DateString == dateStr &&
				_selectedBlock.StartMinute == startTotal &&
				_selectedBlock.EndMinute == endTotal &&
				_selectedBlock.ColorIndex == colorIdx)
			{
				// No Change
				HideEditDialog();
				return;
			}

			// Check if we are editing a Recurring Instance (Transient)
			bool isTransient = !_data.TimeBlocks.Contains(_selectedBlock);

			if (isTransient)
			{
				ShowRecurrencePopup(RecurrenceAction.Save);
				return;
			}

			// Normal Save Logic
			_selectedBlock.Title = title;
			_selectedBlock.Description = desc;
			_selectedBlock.RecurrenceRule = recur;
			_selectedBlock.RecurrenceEnd = recurEnd;
			_selectedBlock.DateString = dateStr;
			_selectedBlock.Tags = new List<string>(_tempEditTags);

			_selectedBlock.StartMinute = startTotal;
			_selectedBlock.EndMinute = endTotal;
			_selectedBlock.ColorIndex = colorIdx;

			SaveData();
			RefreshSchedule();
			HideEditDialog();
		}

		private void OnDeleteEdit()
		{
			if (_selectedBlock == null) return;

			bool isTransient = !_data.TimeBlocks.Contains(_selectedBlock);

			if (isTransient)
			{
				ShowRecurrencePopup(RecurrenceAction.Delete);
				return;
			}

			// Normal Delete
			if (_data.TimeBlocks.Contains(_selectedBlock))
			{
				_data.TimeBlocks.Remove(_selectedBlock);
				SaveData();
				RefreshSchedule();
			}
			HideEditDialog();
			HideDetailPopup();
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
				if (_colorBtns[i] == null) continue;

				Color c = (i == _selectedColorIndex) ? Color.white : Color.clear;
				var sc = new StyleColor(c);

				_colorBtns[i].style.borderTopColor = sc;
				_colorBtns[i].style.borderBottomColor = sc;
				_colorBtns[i].style.borderLeftColor = sc;
				_colorBtns[i].style.borderRightColor = sc;
			}
		}

		// --- Tag Logic ---

		private void AddEditTag(string tag)
		{
			if (string.IsNullOrWhiteSpace(tag)) return;
			tag = tag.Trim();
			if (!_tempEditTags.Contains(tag))
			{
				_tempEditTags.Add(tag);
				RenderEditTags();
			}
		}

		private void RemoveEditTag(string tag)
		{
			if (_tempEditTags.Contains(tag))
			{
				_tempEditTags.Remove(tag);
				RenderEditTags();
			}
		}

		private void RenderEditTags()
		{
			if (_editTagsContainer == null) return;
			_editTagsContainer.Clear();
			foreach (var tag in _tempEditTags)
			{
				var chip = new VisualElement();
				chip.style.flexDirection = FlexDirection.Row;
				chip.style.backgroundColor = new StyleColor(new Color(0.2f, 0.2f, 0.2f));
				chip.style.paddingLeft = 5; chip.style.paddingRight = 5;
				chip.style.paddingTop = 2; chip.style.paddingBottom = 2;
				chip.style.marginRight = 5; chip.style.marginBottom = 5;
				chip.style.borderTopLeftRadius = 10; chip.style.borderTopRightRadius = 10;
				chip.style.borderBottomLeftRadius = 10; chip.style.borderBottomRightRadius = 10;
				chip.style.alignItems = Align.Center;

				var label = new Label(tag);
				label.style.color = new StyleColor(Color.white);
				label.style.marginRight = 5;
				chip.Add(label);

				// Use a local copy for lambda capture
				string t = tag;
				var dim = new Button(() => RemoveEditTag(t));
				dim.text = "x";
				dim.style.backgroundColor = Color.clear;
				dim.style.borderTopWidth = 0; dim.style.borderBottomWidth = 0; dim.style.borderLeftWidth = 0; dim.style.borderRightWidth = 0;
				dim.style.color = new StyleColor(new Color(1f, 0.5f, 0.5f));
				dim.style.paddingLeft = 2; dim.style.paddingRight = 2;
				chip.Add(dim);

				_editTagsContainer.Add(chip);
			}
		}
		// --- Trash Logic ---
		private VisualElement _trashPopup;
		private ScrollView _trashList;
		private Button _trashCloseBtn;
		private Button _openTrashBtn;

		private void InitializeTrash(VisualElement root)
		{
			_trashPopup = root.Q("TrashPopup");
			_trashList = root.Q<ScrollView>("TrashList");
			_trashCloseBtn = root.Q<Button>("TrashCloseBtn");
			_openTrashBtn = root.Q<Button>("OpenTrashBtn");

			if (_trashCloseBtn != null)
			{
				_trashCloseBtn.clicked -= HideTrashPopup;
				_trashCloseBtn.clicked += HideTrashPopup;
			}

			if (_openTrashBtn != null)
			{
				_openTrashBtn.clicked -= ShowTrashPopup;
				_openTrashBtn.clicked += ShowTrashPopup;
			}
		}

		private void ShowTrashPopup()
		{
			if (_trashPopup == null) return;
			RenderTrashList();
			_trashPopup.style.display = DisplayStyle.Flex;
		}

		private void HideTrashPopup()
		{
			if (_trashPopup != null) _trashPopup.style.display = DisplayStyle.None;
		}

		private void RenderTrashList()
		{
			if (_trashList == null || _data == null) return;
			_trashList.Clear();

			var deletedBlocks = _data.TimeBlocks
				.Where(b => b.IsDeleted)
				.OrderByDescending(b => b.DeletedTicks)
				.ToList();

			if (deletedBlocks.Count == 0)
			{
				var emptyLabel = new Label("Trash is empty.");
				emptyLabel.style.color = Color.gray;
				emptyLabel.style.alignSelf = Align.Center;
				emptyLabel.style.marginTop = 20;
				_trashList.Add(emptyLabel);
				return;
			}

			foreach (var block in deletedBlocks)
			{
				var row = new VisualElement();
				row.style.flexDirection = FlexDirection.Row;
				row.style.alignItems = Align.Center;
				row.style.marginBottom = 5;
				row.style.paddingLeft = 5; row.style.paddingRight = 5;
				row.style.paddingTop = 5; row.style.paddingBottom = 5;
				row.style.backgroundColor = new StyleColor(new Color(0.2f, 0.2f, 0.2f));
				row.style.borderTopLeftRadius = 4; row.style.borderTopRightRadius = 4;
				row.style.borderBottomLeftRadius = 4; row.style.borderBottomRightRadius = 4;

				// Color indicator
				var colorBox = new VisualElement();
				colorBox.style.width = 10; colorBox.style.height = 10;
				colorBox.style.marginRight = 10;
				colorBox.AddToClassList($"block-color-{block.ColorIndex}");
				row.Add(colorBox);

				// Info
				var infoBox = new VisualElement();
				infoBox.style.flexGrow = 1;
				var titleLbl = new Label(block.Title);
				titleLbl.style.color = Color.white;
				titleLbl.style.unityFontStyleAndWeight = FontStyle.Bold;
				infoBox.Add(titleLbl);

				var timeLbl = new Label($"{block.DateString} {TimeStr(block.StartMinute)}~{TimeStr(block.EndMinute)}");
				timeLbl.style.color = Color.gray;
				timeLbl.style.fontSize = 10;
				infoBox.Add(timeLbl);

				// Deleted Time
				var deletedDate = new DateTime(block.DeletedTicks);
				var delLbl = new Label($"Del: {deletedDate:MM/dd HH:mm}");
				delLbl.style.color = new Color(0.8f, 0.4f, 0.4f);
				delLbl.style.fontSize = 9;
				infoBox.Add(delLbl);

				row.Add(infoBox);

				// Restore Button
				var restoreBtn = new Button(() => RestoreBlock(block));
				restoreBtn.text = "♻️";
				restoreBtn.tooltip = "Restore";
				restoreBtn.style.backgroundColor = new Color(0.2f, 0.6f, 0.2f);
				restoreBtn.style.color = Color.white;
				restoreBtn.style.width = 30;
				row.Add(restoreBtn);

				// Delete Forever Button
				var delBtn = new Button(() => PermaDeleteBlock(block));
				delBtn.text = "❌";
				delBtn.tooltip = "Delete Forever";
				delBtn.style.width = 30;
				delBtn.style.backgroundColor = new Color(0.8f, 0.2f, 0.2f);
				delBtn.style.color = Color.white;
				delBtn.style.marginLeft = 5;
				row.Add(delBtn);

				_trashList.Add(row);
			}
		}

		private void RestoreBlock(TimeBlock block)
		{
			block.IsDeleted = false;
			block.DeletedTicks = 0;
			SaveData();
			RefreshSchedule();
			RenderTrashList(); // Refresh list
			Debug.Log($"[Planner] Restored block: {block.Title}");
		}

		private void PermaDeleteBlock(TimeBlock block)
		{
			if (_data.TimeBlocks.Remove(block))
			{
				SaveData();
				RefreshSchedule(); // Just in case
				RenderTrashList(); // Refresh list
				Debug.Log($"[Planner] Permanently deleted block: {block.Title}");
			}
		}
	}
}
