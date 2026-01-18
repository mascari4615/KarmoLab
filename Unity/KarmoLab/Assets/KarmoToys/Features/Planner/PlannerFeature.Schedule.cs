using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Common;
using KarmoToys.Common.Data;
using KarmoToys.Main;

namespace KarmoToys.Features.Planner
{
	public partial class PlannerFeature
	{
		private float _dragOffsetY;
		private bool _isResizing = false;
		private bool _isResizeTop = false;
		private TimeBlock _resizingBlock;


		// Current Time Indicator
		private VisualElement _currentTimeIndicator;

		private void AdjustCurrentDateToStartOfWeek()
		{
			int diff = (7 + (_currentDate.DayOfWeek - _startDayOfWeek)) % 7;
			_currentDate = _currentDate.AddDays(-1 * diff);
		}

		private void OnPrevWeek() => ChangeWeek(-7);
		private void OnNextWeek() => ChangeWeek(7);

		private void ChangeWeek(int offset)
		{
			_currentDate = _currentDate.AddDays(offset);
			AdjustCurrentDateToStartOfWeek();
			RefreshSchedule();
		}

		private void BuildTimeRuler()
		{
			if (_timeRuler == null) return;

			_timeRuler.Clear();
			_dayColumns.Clear();

			_timeRuler.style.height = 24 * 60 * _pixelsPerMinute;

			// 1. Time Axis
			_timeAxis = new VisualElement();
			_timeAxis.AddToClassList("time-axis");
			for (int i = 0; i < 24; i++)
			{
				Label label = new Label($"{i:00}:00");
				label.AddToClassList("hour-label");
				label.style.top = i * 60 * _pixelsPerMinute;
				_timeAxis.Add(label);
			}
			_timeRuler.Add(_timeAxis);

			// Weekend Logic
			bool showWeekend = true;
			if (_weekendToggle != null) showWeekend = _weekendToggle.value;

			int daysToShow = showWeekend ? 7 : 5;

			// 2. Day Columns
			for (int i = 0; i < 7; i++)
			{
				DateTime date = _currentDate.AddDays(i);
				bool isWeekend = date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday;

				if (!showWeekend && isWeekend) continue;

				VisualElement dayCol = new VisualElement();
				dayCol.AddToClassList("day-column");
				dayCol.name = $"DayColumn_{i}";
				dayCol.userData = i;
				dayCol.style.width = Length.Percent(100f / daysToShow);

				Label header = new Label("Date");
				header.AddToClassList("day-header");
				header.name = "Header";
				dayCol.Add(header);

				for (int h = 0; h < 24; h++)
				{
					VisualElement line = new VisualElement();
					line.AddToClassList("hour-line");
					line.style.top = h * 60 * _pixelsPerMinute;
					dayCol.Add(line);
				}

				_dayColumns.Add(dayCol);
				_timeRuler.Add(dayCol);
			}

			// 3. Current Time Indicator (UXML에서 찾지 못했을 경우만 임시 상단으로 Add)
			_timeRuler.Add(_currentTimeIndicator);
		}

		private void RefreshSchedule()
		{
			if (_timeRuler == null) return;
			ScheduleData data = KarmoToysApp.Instance.Data?.Schedule;
			if (data == null) return;

			_timeRuler.style.height = 24 * 60 * _pixelsPerMinute;

			DateTime endWeek = _currentDate.AddDays(6);
			_schedDateLabel.text = $"{_currentDate:yyyy-MM-dd} ~ {endWeek:yyyy-MM-dd}";

			BuildTimeRuler();

			// Tags Setup
			HashSet<string> allTags = new HashSet<string>();
			foreach (TimeBlock b in data.TimeBlocks)
			{
				if (b.Tags != null) foreach (string t in b.Tags) allTags.Add(t);
			}
			List<string> list = allTags.OrderBy(t => t).ToList();
			list.Insert(0, "All Tags");

			_tagFilterDropdown.choices = list;
			if (string.IsNullOrEmpty(_tagFilterDropdown.value) || !_tagFilterDropdown.choices.Contains(_tagFilterDropdown.value))
				_tagFilterDropdown.value = "All Tags";

			string filterTag = _tagFilterDropdown.value;
			bool useFilter = !string.IsNullOrEmpty(filterTag) && filterTag != "All Tags";

			bool showWeekend = true;
			showWeekend = _weekendToggle.value;

			// Fill Columns
			int colIndex = 0;
			for (int i = 0; i < 7; i++)
			{
				DateTime targetDate = _currentDate.AddDays(i);
				bool isWeekend = targetDate.DayOfWeek == DayOfWeek.Saturday || targetDate.DayOfWeek == DayOfWeek.Sunday;

				if (!showWeekend && isWeekend) continue;
				if (colIndex >= _dayColumns.Count) break;

				VisualElement col = _dayColumns[colIndex];
				colIndex++;

				Label header = col.Q<Label>("Header");
				if (header != null) header.text = targetDate.ToString("MM/dd (ddd)");

				// Filter & Collect Blocks
				string dateStr = targetDate.ToString("yyyy-MM-dd");
				List<TimeBlock> rawBlocks = new List<TimeBlock>();

				foreach (TimeBlock b in data.TimeBlocks)
				{
					if (b.IsDeleted) continue;

					if (b.DateString == dateStr && (string.IsNullOrEmpty(b.RecurrenceRule) || b.RecurrenceRule == "None"))
					{
						rawBlocks.Add(b);
					}
					else if (!string.IsNullOrEmpty(b.RecurrenceRule) && b.RecurrenceRule != "None")
					{
						if (string.Compare(b.DateString, dateStr) > 0) continue;
						if (!string.IsNullOrEmpty(b.RecurrenceEnd) && string.Compare(b.RecurrenceEnd, dateStr) < 0) continue;
						if (b.ExceptionDates != null && b.ExceptionDates.Contains(dateStr)) continue;

						if (IsRecurrenceMatch(b, targetDate))
						{
							TimeBlock transient = new TimeBlock(dateStr, b.StartMinute, b.EndMinute, b.Title);
							transient.Id = b.Id;
							transient.Description = b.Description;
							transient.ColorIndex = b.ColorIndex;
							transient.Tags = new List<string>(b.Tags);
							transient.RecurrenceRule = b.RecurrenceRule;
							rawBlocks.Add(transient);
						}
					}
				}

				List<TimeBlock> blocks = rawBlocks
					.Where(b => !useFilter || (b.Tags != null && b.Tags.Contains(filterTag)))
					.OrderBy(b => b.StartMinute)
					.ThenByDescending(b => b.EndMinute)
					.ToList();

				if (blocks.Count == 0) continue;

				// Clusters
				List<List<TimeBlock>> clusters = new List<List<TimeBlock>>();
				foreach (TimeBlock block in blocks)
				{
					bool added = false;
					foreach (List<TimeBlock> cluster in clusters)
					{
						int clusterEnd = cluster.Max(b => b.EndMinute);
						if (block.StartMinute < clusterEnd)
						{
							cluster.Add(block);
							added = true;
							break;
						}
					}
					if (!added) clusters.Add(new List<TimeBlock> { block });
				}

				foreach (List<TimeBlock> cluster in clusters)
				{
					List<List<TimeBlock>> columns = new List<List<TimeBlock>>();
					foreach (TimeBlock block in cluster)
					{
						bool placed = false;
						foreach (List<TimeBlock> subCol in columns)
						{
							TimeBlock last = subCol[subCol.Count - 1];
							if (block.StartMinute >= last.EndMinute)
							{
								subCol.Add(block);
								placed = true;
								break;
							}
						}
						if (!placed) columns.Add(new List<TimeBlock> { block });
					}

					int totalClusterCols = columns.Count;
					for (int c = 0; c < totalClusterCols; c++)
					{
						foreach (TimeBlock block in columns[c])
						{
							VisualElement visual = CreateBlockVisual(block, (block.EndMinute - block.StartMinute) * _pixelsPerMinute);

							float top = block.StartMinute * _pixelsPerMinute;
							float height = (block.EndMinute - block.StartMinute) * _pixelsPerMinute;

							visual.style.top = top;
							visual.style.height = height;
							visual.style.left = Length.Percent(100f / totalClusterCols * c);
							visual.style.width = Length.Percent(100f / totalClusterCols);

							// Native Tooltip
							visual.tooltip = $"{block.Title}\n{TimeStr(block.StartMinute)} - {TimeStr(block.EndMinute)}";

							col.Add(visual);
						}
					}
				}
			}

			// Update current time indicator
			UpdateCurrentTimeIndicator();
		}

		private void UpdateCurrentTimeIndicator()
		{
			if (_currentTimeIndicator == null) return;

			DateTime now = DateTime.Now;
			DateTime startOfWeek = _currentDate;
			DateTime endOfWeek = _currentDate.AddDays(6);

			// 오늘이 현재 표시 중인 주에 포함되는지 확인
			if (now.Date < startOfWeek.Date || now.Date > endOfWeek.Date)
			{
				_currentTimeIndicator.style.display = DisplayStyle.None;
				return;
			}

			// 현재 시간을 초 단위까지 포함하여 계산 (정밀도 향상)
			float totalMinutes = now.Hour * 60 + now.Minute + (now.Second / 60f);
			float topPosition = totalMinutes * _pixelsPerMinute;

			_currentTimeIndicator.style.top = topPosition;
			_currentTimeIndicator.style.display = DisplayStyle.Flex;
		}

		private bool IsRecurrenceMatch(TimeBlock b, DateTime targetDate)
		{
			DateTime start = DateTime.Parse(b.DateString);

			if (b.RecurrenceRule == "Daily") return true;

			if (b.RecurrenceRule.StartsWith("Weekly"))
			{
				string[] parts = b.RecurrenceRule.Split(';');
				if (parts.Length > 1)
				{
					string[] dayNames = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
					string currentDay = dayNames[(int)targetDate.DayOfWeek]; // Force English day name
					string[] selectedDays = parts[1].Split(','); // "Mon", "Fri"
					if (selectedDays.Contains(currentDay)) return true;
				}
				else
				{
					if (start.DayOfWeek == targetDate.DayOfWeek) return true;
				}
			}
			else if (b.RecurrenceRule.StartsWith("Monthly"))
			{
				if (b.RecurrenceRule == "Monthly")
				{
					if (start.Day == targetDate.Day) return true;
				}
				else
				{
					int d = -1;
					string[] parts = b.RecurrenceRule.Split(';');
					foreach (string p in parts) if (p.StartsWith("Day:")) int.TryParse(p.Substring(4), out d);
					if (targetDate.Day == d) return true;
				}
			}
			else if (b.RecurrenceRule.StartsWith("Yearly"))
			{
				int m = -1, d = -1;
				string[] parts = b.RecurrenceRule.Split(';');
				foreach (string p in parts)
				{
					if (p.StartsWith("Month:")) int.TryParse(p.Substring(6), out m);
					else if (p.StartsWith("Day:")) int.TryParse(p.Substring(4), out d);
				}
				if (targetDate.Month == m && targetDate.Day == d) return true;
			}
			return false;
		}

		private VisualElement CreateBlockVisual(TimeBlock block, float blockHeight = 0)
		{
			VisualElement visualBlock = new VisualElement();
			visualBlock.AddToClassList("time-block");
			visualBlock.AddToClassList($"block-color-{block.ColorIndex}");
			visualBlock.style.position = Position.Absolute;
			visualBlock.userData = block;
			visualBlock.userData = block;
			visualBlock.tooltip = $"{block.Title}\n{TimeStr(block.StartMinute)} - {TimeStr(block.EndMinute)}";

			if (blockHeight >= 15f)
			{
				bool isShort = blockHeight < 50f;
				if (isShort) visualBlock.AddToClassList("time-block-row");

				Label titleLabel = new Label(string.IsNullOrEmpty(block.Title) ? "(No Title)" : block.Title);
				titleLabel.AddToClassList("time-block-title");
				titleLabel.pickingMode = PickingMode.Ignore; // 툴팁 방해 방지
				visualBlock.Add(titleLabel);

				string timeStr = isShort ? TimeStr(block.StartMinute) : $"{TimeStr(block.StartMinute)} - {TimeStr(block.EndMinute)}";
				Label timeLabel = new Label(timeStr);
				timeLabel.AddToClassList("time-block-time");
				timeLabel.pickingMode = PickingMode.Ignore;
				visualBlock.Add(timeLabel);
			}

			Button moreBtn = new Button(() => ShowDetailPopup(block));
			moreBtn.text = "...";
			moreBtn.AddToClassList("time-block-btn");
			moreBtn.pickingMode = PickingMode.Position; // 버튼 입력 활성화
			visualBlock.Add(moreBtn);

			visualBlock.RegisterCallback<PointerDownEvent>(evt =>
			{
				if (evt.button == 1) // Right Click
				{
					ShowDetailPopup(block);
					evt.StopPropagation();
				}
			});

			// Resize Handles
			VisualElement resizeTop = new VisualElement { name = "ResizeTop" };
			resizeTop.style.position = Position.Absolute; resizeTop.style.top = 0; resizeTop.style.left = 0;
			resizeTop.style.width = Length.Percent(50); resizeTop.style.height = 8;
			resizeTop.style.backgroundColor = new StyleColor(new Color(1, 0, 0, 0.01f));
			resizeTop.RegisterCallback<PointerDownEvent>(evt => OnResizeStart(evt, block, visualBlock, true));
			visualBlock.Add(resizeTop);

			VisualElement resizeBottom = new VisualElement { name = "ResizeBottom" };
			resizeBottom.style.position = Position.Absolute; resizeBottom.style.bottom = 0; resizeBottom.style.left = 0;
			resizeBottom.style.width = Length.Percent(50); resizeBottom.style.height = 8;
			resizeBottom.style.backgroundColor = new StyleColor(new Color(0, 0, 1, 0.01f));
			resizeBottom.RegisterCallback<PointerDownEvent>(evt => OnResizeStart(evt, block, visualBlock, false));
			visualBlock.Add(resizeBottom);

			resizeTop.BringToFront();
			resizeBottom.BringToFront();

			return visualBlock;
		}

		private void OnResizeStart(PointerDownEvent evt, TimeBlock block, VisualElement visual, bool isTop)
		{
			if (evt.button != 0) return;
			_isResizing = true;
			_isResizeTop = isTop;
			_resizingBlock = block;
			_resizingVisual = visual;
			_resizeStartMouseY = evt.position.y;
			_resizeStartBlockTop = visual.layout.y;
			if (float.IsNaN(_resizeStartBlockTop)) _resizeStartBlockTop = visual.style.top.value.value;
			_resizeStartBlockHeight = visual.layout.height;
			if (float.IsNaN(_resizeStartBlockHeight)) _resizeStartBlockHeight = visual.style.height.value.value;

			evt.StopPropagation();
			if (_timeRuler != null) _timeRuler.CapturePointer(evt.pointerId);
		}

		private string TimeStr(int m) => $"{m / 60:00}:{m % 60:00}";

		private float Snap(float value, float interval) => Mathf.Round(value / interval) * interval;

		private int GetColumnIndex(float localX)
		{
			float axisWidth = 60f;
			if (localX < axisWidth) return -1;
			float rulerWidth = _timeRuler.contentRect.width;
			if (float.IsNaN(rulerWidth) || rulerWidth <= axisWidth) return -1;

			bool showWeekend = _weekendToggle.value;
			float numCols = showWeekend ? 7f : 5f;
			float columnWidth = (rulerWidth - axisWidth) / numCols;

			int colIndex = Mathf.FloorToInt((localX - axisWidth) / columnWidth);
			if (colIndex < 0 || colIndex >= (int)numCols) return -1;
			return colIndex;
		}

		private VisualElement FindAncestorBlock(VisualElement current)
		{
			while (current != null)
			{
				if (current.ClassListContains("time-block")) return current;
				current = current.parent;
			}
			return null;
		}

		private void OnRulerPointerDown(PointerDownEvent evt)
		{
			if (_timeRuler == null || evt.button != 0) return;
			_timeRuler.CapturePointer(evt.pointerId);

			VisualElement target = evt.target as VisualElement;
			VisualElement hitBlock = FindAncestorBlock(target);

			if (hitBlock != null)
			{
				_dragMode = DragMode.Move;
				_moveSourceBlock = hitBlock.userData as TimeBlock;
				if (_moveSourceBlock == null) { _dragMode = DragMode.None; return; }

				_dragColumnIndex = GetColumnIndex(evt.localPosition.x);
				float blockTop = _moveSourceBlock.StartMinute * _pixelsPerMinute;
				_dragOffsetY = evt.localPosition.y - blockTop;

				hitBlock.style.opacity = 0.5f;

				_ghostBlock = new VisualElement();
				_ghostBlock.AddToClassList("time-block");
				_ghostBlock.AddToClassList($"block-color-{_moveSourceBlock.ColorIndex}");
				_ghostBlock.style.position = Position.Absolute;
				_ghostBlock.style.left = 0; _ghostBlock.style.right = 0;
				float h = (_moveSourceBlock.EndMinute - _moveSourceBlock.StartMinute) * _pixelsPerMinute;
				_ghostBlock.style.top = blockTop;
				_ghostBlock.style.height = h;

				// Add to current column
				if (_dragColumnIndex >= 0 && _dragColumnIndex < _dayColumns.Count)
					_dayColumns[_dragColumnIndex].Add(_ghostBlock);
			}
			else
			{
				_dragMode = DragMode.Create;
				float snapY = Snap(evt.localPosition.y, _snapInterval * _pixelsPerMinute);
				_dragStartY = snapY;
				_dragColumnIndex = GetColumnIndex(evt.localPosition.x);

				if (_dragColumnIndex >= 0 && _dragColumnIndex < _dayColumns.Count)
				{
					_ghostBlock = new VisualElement();
					_ghostBlock.AddToClassList("time-block");
					_ghostBlock.AddToClassList("block-color-0");
					_ghostBlock.style.position = Position.Absolute;
					_ghostBlock.style.left = 0; _ghostBlock.style.right = 0;
					_ghostBlock.style.top = snapY;
					_ghostBlock.style.height = 0;
					_dayColumns[_dragColumnIndex].Add(_ghostBlock);
				}
				else _dragMode = DragMode.None;
			}
		}

		private void OnRulerPointerMove(PointerMoveEvent evt)
		{
			if (_isResizing)
			{
				if (_resizingVisual != null)
				{
					float deltaY = evt.position.y - _resizeStartMouseY;
					if (_isResizeTop)
					{
						float newTop = _resizeStartBlockTop + deltaY;
						float newHeight = _resizeStartBlockHeight - deltaY;
						float minHeight = _snapInterval * _pixelsPerMinute;
						if (newHeight < minHeight) { newHeight = minHeight; newTop = (_resizeStartBlockTop + _resizeStartBlockHeight) - minHeight; }
						if (newTop < 0) { newTop = 0; newHeight = _resizeStartBlockTop + _resizeStartBlockHeight; }
						_resizingVisual.style.top = newTop;
						_resizingVisual.style.height = newHeight;
					}
					else
					{
						float newHeight = _resizeStartBlockHeight + deltaY;
						float minHeight = _snapInterval * _pixelsPerMinute;
						if (newHeight < minHeight) newHeight = minHeight;
						if (_resizingVisual.style.top.value.value + newHeight > 24 * 60 * _pixelsPerMinute) newHeight = (24 * 60 * _pixelsPerMinute) - _resizingVisual.style.top.value.value;
						_resizingVisual.style.height = newHeight;
					}
				}
				evt.StopPropagation();
				return;
			}

			if (_dragMode == DragMode.None || _ghostBlock == null) return;

			int curColIndex = GetColumnIndex(evt.localPosition.x);

			if (_dragMode == DragMode.Create)
			{
				float currentY = Snap(evt.localPosition.y, _snapInterval * _pixelsPerMinute);
				float top = Mathf.Min(_dragStartY, currentY);
				float height = Mathf.Abs(currentY - _dragStartY);
				_ghostBlock.style.top = top;
				_ghostBlock.style.height = height;
			}
			else if (_dragMode == DragMode.Move)
			{
				float rawTop = evt.localPosition.y - _dragOffsetY;
				float snappedTop = Snap(rawTop, _snapInterval * _pixelsPerMinute);
				if (snappedTop < 0) snappedTop = 0;

				if (curColIndex != -1 && curColIndex != _dragColumnIndex && curColIndex < _dayColumns.Count)
				{
					_ghostBlock.parent?.Remove(_ghostBlock);
					_dayColumns[curColIndex].Add(_ghostBlock);
					_dragColumnIndex = curColIndex;
				}
				_ghostBlock.style.top = snappedTop;
			}
		}

		private void OnRulerPointerUp(IPointerEvent evt)
		{
			if (_isResizing)
			{
				if (_timeRuler != null && evt is PointerUpEvent upEvt) _timeRuler.ReleasePointer(upEvt.pointerId);
				if (_resizingVisual != null && _resizingBlock != null)
				{
					float finalTop = _resizingVisual.style.top.value.value;
					float finalHeight = _resizingVisual.style.height.value.value;
					int startMin = Mathf.RoundToInt(finalTop / _pixelsPerMinute);
					int endMin = Mathf.RoundToInt((finalTop + finalHeight) / _pixelsPerMinute);
					int interval = (int)_snapInterval;
					startMin = Mathf.RoundToInt((float)startMin / interval) * interval;
					endMin = Mathf.RoundToInt((float)endMin / interval) * interval;
					if (endMin <= startMin) endMin = startMin + interval;
					if (endMin > 1440) endMin = 1440;

					if (startMin == _resizingBlock.StartMinute && endMin == _resizingBlock.EndMinute)
					{
						_isResizing = false; _resizingBlock = null; _resizingVisual = null;
						return;
					}

					_resizingBlock.StartMinute = startMin;
					_resizingBlock.EndMinute = endMin;

					ScheduleData data = KarmoToysApp.Instance.Data?.Schedule;
					if (data != null)
					{
						bool isTransient = !data.TimeBlocks.Contains(_resizingBlock);
						if (isTransient)
						{
							RequestRecurrenceMove(_resizingBlock, _resizingBlock.DateString, startMin, endMin);
						}
						else
						{
							KarmoToysApp.Instance.SaveData();
							RefreshSchedule();
						}
					}
				}
				_isResizing = false; _resizingBlock = null; _resizingVisual = null;
				return;
			}

			if (_dragMode == DragMode.None) return;

			if (_timeRuler != null && evt is PointerUpEvent upEvt2) _timeRuler.ReleasePointer(upEvt2.pointerId);

			if (_ghostBlock != null)
			{
				float top = _ghostBlock.style.top.value.value;
				float height = _ghostBlock.style.height.value.value;

				_ghostBlock.parent?.Remove(_ghostBlock);
				_ghostBlock = null;

				int startMin = Mathf.RoundToInt(top / _pixelsPerMinute);
				int endMin = Mathf.RoundToInt((top + height) / _pixelsPerMinute);
				if (startMin < 0) startMin = 0;
				if (endMin > 24 * 60) endMin = 24 * 60;

				ScheduleData data = KarmoToysApp.Instance.Data?.Schedule;
				if (data != null)
				{
					if (_dragMode == DragMode.Create)
					{
						if (height >= _snapInterval && endMin > startMin)
						{
							int offset = (int)_dayColumns[_dragColumnIndex].userData;
							DateTime targetDate = _currentDate.AddDays(offset);
							if (endMin - startMin < 30) endMin = startMin + 30;
							data.TimeBlocks.Add(new TimeBlock(targetDate.ToString("yyyy-MM-dd"), startMin, endMin, "New Event"));
							KarmoToysApp.Instance.SaveData();
						}
					}
					else if (_dragMode == DragMode.Move && _moveSourceBlock != null)
					{
						if (endMin > startMin && _dragColumnIndex != -1)
						{
							int offset = (int)_dayColumns[_dragColumnIndex].userData;
							DateTime targetDate = _currentDate.AddDays(offset);
							string targetDateStr = targetDate.ToString("yyyy-MM-dd");

							if (_moveSourceBlock.StartMinute != startMin || _moveSourceBlock.EndMinute != endMin || _moveSourceBlock.DateString != targetDateStr)
							{
								bool isTransient = !data.TimeBlocks.Contains(_moveSourceBlock);
								if (isTransient)
								{
									RequestRecurrenceMove(_moveSourceBlock, targetDateStr, startMin, endMin);
								}
								else
								{
									_moveSourceBlock.DateString = targetDateStr;
									_moveSourceBlock.StartMinute = startMin;
									_moveSourceBlock.EndMinute = endMin;
									KarmoToysApp.Instance.SaveData();
								}
							}
						}
					}
					RefreshSchedule();
				}
			}
			_dragMode = DragMode.None;
			_moveSourceBlock = null;
			_dragColumnIndex = -1;
		}
	}
}
