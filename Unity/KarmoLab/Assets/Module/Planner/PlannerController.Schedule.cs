using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoLab.Module.Planner
{
	public partial class PlannerController
	{
		private void AdjustCurrentDateToStartOfWeek()
		{
			int diff = (7 + (_currentDate.DayOfWeek - _startDayOfWeek)) % 7;
			_currentDate = _currentDate.AddDays(-1 * diff);
		}

		private void OnPrevWeek() => ChangeWeek(-7);
		private void OnNextWeek() => ChangeWeek(7);

		// --- 일정 로직 (주간 보기) ---
		private void ChangeWeek(int offset)
		{
			_currentDate = _currentDate.AddDays(offset);
			AdjustCurrentDateToStartOfWeek(); // 정렬 보장
			RefreshSchedule();
		}

		private void BuildTimeRuler()
		{
			_timeRuler.Clear();
			_dayColumns.Clear();

			// 배율에 따라 드래그 영역의 명시적 높이 설정
			_timeRuler.style.height = 24 * 60 * _pixelsPerMinute;

			// 1. 시간 축 (가장 왼쪽)
			_timeAxis = new VisualElement();
			_timeAxis.AddToClassList("time-axis");
			for (int i = 0; i < 24; i++) // 24시간
			{
				var label = new Label($"{i:00}:00");
				label.AddToClassList("hour-label");
				label.style.top = i * 60 * _pixelsPerMinute;
				_timeAxis.Add(label);
			}
			_timeRuler.Add(_timeAxis);

			// 주말 로직
			bool showWeekend = true;
			if (_weekendToggle != null) showWeekend = _weekendToggle.value;

			int daysToShow = showWeekend ? 7 : 5;

			// 2. 일간 열
			for (int i = 0; i < 7; i++)
			{
				// 주말 여부를 확인하기 위해 실제 날짜 먼저 계산
				DateTime date = _currentDate.AddDays(i);
				bool isWeekend = date.DayOfWeek == DayOfWeek.Saturday || date.DayOfWeek == DayOfWeek.Sunday;

				if (!showWeekend && isWeekend) continue; // 토글이 꺼져 있으면 건너뜀

				var dayCol = new VisualElement();
				dayCol.AddToClassList("day-column");
				dayCol.name = $"DayColumn_{i}";
				dayCol.userData = i; // 드래그 매핑을 위한 일자 오프셋 저장
									 // 표시 개수에 따라 너비 조정
				dayCol.style.width = Length.Percent(100f / daysToShow);

				// 헤더 (날짜)
				var header = new Label("Date");
				header.AddToClassList("day-header");
				header.name = "Header";
				dayCol.Add(header);

				// 가독성을 위해 각 열 내부의 그리드 라인
				for (int h = 0; h < 24; h++)
				{
					var line = new VisualElement();
					line.AddToClassList("hour-line");
					line.style.top = h * 60 * _pixelsPerMinute;
					dayCol.Add(line);
				}

				_dayColumns.Add(dayCol); // 참고: 리스트의 인덱스가 더 이상 +i와 일치하지 않을 수 있음
				_timeRuler.Add(dayCol);
			}
		}

		private void RefreshSchedule()
		{
			if (_timeRuler == null) return;

			// 컨테이너 높이가 현재 배율과 일치하는지 확인
			_timeRuler.style.height = 24 * 60 * _pixelsPerMinute;

			// _currentDate가 주의 시작인지 확인 (사용자가 롤링 7일 또는 일/월 정렬을 원할 수 있음)
			// 현재로서는 _currentDate를 뷰의 시작일로 취급

			DateTime endWeek = _currentDate.AddDays(6);
			if (_schedDateLabel != null)
				_schedDateLabel.text = $"{_currentDate:yyyy-MM-dd} ~ {endWeek:yyyy-MM-dd}";

			BuildTimeRuler();

			// 태그 수집
			HashSet<string> allTags = new HashSet<string>();
			foreach (var b in _data.TimeBlocks)
			{
				if (b.Tags != null) foreach (var t in b.Tags) allTags.Add(t);
			}
			if (_tagFilterDropdown != null)
			{
				var list = allTags.OrderBy(t => t).ToList();
				list.Insert(0, "All Tags");
				_tagFilterDropdown.choices = list;
				if (string.IsNullOrEmpty(_tagFilterDropdown.value) || !_tagFilterDropdown.choices.Contains(_tagFilterDropdown.value))
					_tagFilterDropdown.value = "All Tags";
			}
			string filterTag = _tagFilterDropdown != null ? _tagFilterDropdown.value : "All Tags";
			bool useFilter = !string.IsNullOrEmpty(filterTag) && filterTag != "All Tags";

			// 생성된 열을 기반으로 다시 반복
			// 어떤 날이 어떤 열 비주얼에 해당하는지 매핑해야 함
			// _dayColumns 리스트는 표시 순서대로 비주얼 요소를 저장함

			bool showWeekend = true;
			if (_weekendToggle != null) showWeekend = _weekendToggle.value;

			int colIndex = 0;
			for (int i = 0; i < 7; i++)
			{
				DateTime targetDate = _currentDate.AddDays(i);
				bool isWeekend = targetDate.DayOfWeek == DayOfWeek.Saturday || targetDate.DayOfWeek == DayOfWeek.Sunday;

				if (!showWeekend && isWeekend) continue;
				if (colIndex >= _dayColumns.Count) break;

				var col = _dayColumns[colIndex];
				colIndex++;

				var header = col.Q<Label>("Header");
				if (header != null)
					header.text = targetDate.ToString("MM/dd (ddd)");

				// 블록 필터링
				var dateStr = targetDate.ToString("yyyy-MM-dd");
				// 1. 해당 날짜에 맞는 블록 수집 (일반 + 반복)
				var rawBlocks = new List<TimeBlock>();

				foreach (var b in _data.TimeBlocks)
				{
					if (b.IsDeleted) continue;

					// A. 일반 블록 (날짜 일치)
					if (b.DateString == dateStr && (string.IsNullOrEmpty(b.RecurrenceRule) || b.RecurrenceRule == "None"))
					{
						rawBlocks.Add(b);
					}
					// B. 반복 블록 (규칙 체크)
					else if (!string.IsNullOrEmpty(b.RecurrenceRule) && b.RecurrenceRule != "None")
					{
						// 시작일 체크
						if (string.Compare(b.DateString, dateStr) > 0) continue;
						// 종료일 체크
						if (!string.IsNullOrEmpty(b.RecurrenceEnd) && string.Compare(b.RecurrenceEnd, dateStr) < 0) continue;
						// 예외 날짜 체크
						if (b.ExceptionDates != null && b.ExceptionDates.Contains(dateStr)) continue;

						// 규칙 매칭
						bool isMatch = false;
						DateTime start = DateTime.Parse(b.DateString);

						if (b.RecurrenceRule == "Daily")
						{
							isMatch = true;
						}
						else if (b.RecurrenceRule.StartsWith("Weekly"))
						{
							try
							{
								var parts = b.RecurrenceRule.Split(';');
								if (parts.Length > 1)
								{
									// Has specific days "Weekly;0,1,3..."
									int currentDayIdx = (int)targetDate.DayOfWeek;
									var dayIndices = parts[1].Split(',').Select(s => int.Parse(s));
									if (dayIndices.Contains(currentDayIdx)) isMatch = true;
								}
								else
								{
									// Legacy "Weekly": Match day of start date
									if (start.DayOfWeek == targetDate.DayOfWeek) isMatch = true;
								}
							}
							catch { isMatch = false; }
						}
						else if (b.RecurrenceRule.StartsWith("Monthly"))
						{
							try
							{
								if (b.RecurrenceRule == "Monthly")
								{
									if (start.Day == targetDate.Day) isMatch = true;
								}
								else
								{
									// Monthly;Day:25
									int d = -1;
									var parts = b.RecurrenceRule.Split(';');
									foreach (var p in parts) if (p.StartsWith("Day:")) int.TryParse(p.Substring(4), out d);
									if (targetDate.Day == d) isMatch = true;
								}
							}
							catch { isMatch = false; }
						}
						else if (b.RecurrenceRule.StartsWith("Yearly"))
						{
							try
							{
								int m = -1, d = -1;
								var parts = b.RecurrenceRule.Split(';');
								foreach (var p in parts)
								{
									if (p.StartsWith("Month:")) int.TryParse(p.Substring(6), out m);
									else if (p.StartsWith("Day:")) int.TryParse(p.Substring(4), out d);
								}
								if (targetDate.Month == m && targetDate.Day == d) isMatch = true;
							}
							catch { isMatch = false; }
						}

						if (isMatch)
						{
							// Transient Block
							var transient = new TimeBlock(dateStr, b.StartMinute, b.EndMinute, b.Title);
							transient.Id = b.Id; // ID 공유
							transient.Description = b.Description;
							transient.ColorIndex = b.ColorIndex;
							transient.Tags = new List<string>(b.Tags);
							transient.RecurrenceRule = b.RecurrenceRule; // 표식
							rawBlocks.Add(transient);
						}
					}
				}

				var blocks = rawBlocks
					.Where(b => !useFilter || (b.Tags != null && b.Tags.Contains(filterTag)))
					.OrderBy(b => b.StartMinute)
					.ThenByDescending(b => b.EndMinute)
					.ToList();

				if (blocks.Count == 0) continue;

				// 열별 클러스터 로직
				var clusters = new List<List<TimeBlock>>();
				foreach (var block in blocks)
				{
					bool added = false;
					foreach (var cluster in clusters)
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

				foreach (var cluster in clusters)
				{
					var columns = new List<List<TimeBlock>>();
					foreach (var block in cluster)
					{
						bool placed = false;
						foreach (var subCol in columns)
						{
							var last = subCol[subCol.Count - 1];
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
						foreach (var block in columns[c])
						{
							// 1. 높이 클램핑 제거 (실제 크기 반영)
							var visual = CreateBlockVisual(block, (block.EndMinute - block.StartMinute) * _pixelsPerMinute);

							float top = block.StartMinute * _pixelsPerMinute;
							float height = (block.EndMinute - block.StartMinute) * _pixelsPerMinute;

							visual.style.top = top;
							visual.style.height = height;
							visual.style.left = Length.Percent(100f / totalClusterCols * c);
							visual.style.width = Length.Percent(100f / totalClusterCols);

							// 2. 툴팁 추가 (마우스 오버 시 정보 표시)
							visual.tooltip = $"{block.Title}\n{TimeStr(block.StartMinute)} - {TimeStr(block.EndMinute)}";

							col.Add(visual);
						}
					}
				}
			}
		} // RefreshSchedule 종료

		// --- 크기 조정 필드 ---
		private bool _isResizing = false;
		private bool _isResizeTop = false;
		private TimeBlock _resizingBlock;
		private VisualElement _resizingVisual;
		private float _resizeStartMouseY;
		private float _resizeStartBlockTop;
		private float _resizeStartBlockHeight;

		private void OnResizeStart(PointerDownEvent evt, TimeBlock block, VisualElement visual, bool isTop)
		{
			if (evt.button != 0) return;

			_isResizing = true;
			_isResizeTop = isTop;
			_resizingBlock = block;
			_resizingVisual = visual;
			_resizeStartMouseY = evt.position.y;
			_resizeStartBlockTop = visual.layout.y; // 또는 style.top.value.value
			if (float.IsNaN(_resizeStartBlockTop)) _resizeStartBlockTop = visual.style.top.value.value;
			_resizeStartBlockHeight = visual.layout.height;
			if (float.IsNaN(_resizeStartBlockHeight)) _resizeStartBlockHeight = visual.style.height.value.value;

			evt.StopPropagation(); // 드래그 이동 방지
			if (_timeRuler != null) _timeRuler.CapturePointer(evt.pointerId);
		}

		private VisualElement CreateBlockVisual(TimeBlock block, float blockHeight = 0)
		{
			var visualBlock = new VisualElement();
			visualBlock.AddToClassList("time-block");
			visualBlock.AddToClassList($"block-color-{block.ColorIndex}");
			visualBlock.style.position = Position.Absolute;
			visualBlock.userData = block;

			// 툴팁 설정 (네이티브 툴팁 제거 후 커스텀 사용)
			visualBlock.tooltip = "";
			visualBlock.RegisterCallback<PointerEnterEvent>(evt => ShowCustomTooltip(block, visualBlock));
			visualBlock.RegisterCallback<PointerLeaveEvent>(evt => HideCustomTooltip());

			// 아주 작은 블록 (15px 미만): 텍스트 숨김
			if (blockHeight < 15f)
			{
				// 내용 없음
			}
			// 작은 블록: 가로 배치
			else if (blockHeight < 50f)
			{
				visualBlock.AddToClassList("time-block-row");
				string titleText = string.IsNullOrEmpty(block.Title) ? "(No Title)" : block.Title;
				var titleLabel = new Label($"{titleText},");
				titleLabel.AddToClassList("time-block-title");
				visualBlock.Add(titleLabel);

				var timeLabel = new Label(TimeStr(block.StartMinute));
				timeLabel.AddToClassList("time-block-time");
				visualBlock.Add(timeLabel);
			}
			// 일반 블록
			else
			{
				var titleLabel = new Label(block.Title);
				titleLabel.AddToClassList("time-block-title");
				visualBlock.Add(titleLabel);

				var timeLabel = new Label($"{TimeStr(block.StartMinute)} - {TimeStr(block.EndMinute)}");
				timeLabel.AddToClassList("time-block-time");
				visualBlock.Add(timeLabel);
			}

			// "..." 버튼
			var moreBtn = new Button(() =>
			{
				ShowDetailPopup(block, visualBlock);
			});
			moreBtn.text = "...";
			moreBtn.AddToClassList("time-block-btn");
			visualBlock.Add(moreBtn);

			// 우클릭 컨텍스트 메뉴 (PointerDown으로 변경)
			visualBlock.RegisterCallback<PointerDownEvent>(evt =>
			{
				if (evt.button == 1) // 0: Left, 1: Right, 2: Middle
				{
					ShowDetailPopup(block, visualBlock);
					evt.StopPropagation();
				}
			});

			// -- 크기 조정 핸들 (왼쪽 50%만 차지) --
			// 디버깅/상호작용 확실화를 위해 아주 희미한 색 적용
			// ZOrder를 위해 맨 마지막에 Add
			var resizeTop = new VisualElement();
			resizeTop.name = "ResizeTop";
			resizeTop.style.position = Position.Absolute;
			resizeTop.style.top = 0;
			resizeTop.style.left = 0;
			resizeTop.style.width = Length.Percent(50);
			resizeTop.style.height = 8;
			resizeTop.style.backgroundColor = new StyleColor(new Color(1, 0, 0, 0.01f)); // 투명도 1% 빨강
			resizeTop.style.cursor = new StyleCursor(StyleKeyword.None);
			resizeTop.RegisterCallback<PointerDownEvent>(evt => OnResizeStart(evt, block, visualBlock, true));
			visualBlock.Add(resizeTop);

			var resizeBottom = new VisualElement();
			resizeBottom.name = "ResizeBottom";
			resizeBottom.style.position = Position.Absolute;
			resizeBottom.style.bottom = 0;
			resizeBottom.style.left = 0;
			resizeBottom.style.width = Length.Percent(50);
			resizeBottom.style.height = 8;
			resizeBottom.style.backgroundColor = new StyleColor(new Color(0, 0, 1, 0.01f)); // 투명도 1% 파랑
			resizeBottom.RegisterCallback<PointerDownEvent>(evt => OnResizeStart(evt, block, visualBlock, false));
			visualBlock.Add(resizeBottom);

			// 리사이즈 핸들이 다른 요소보다 위에 오도록 BringToFront
			resizeTop.BringToFront();
			resizeBottom.BringToFront();

			return visualBlock;
		}

		// --- Custom Tooltip Logic ---
		private VisualElement _customTooltip;
		private Label _customTooltipLabel;

		private void CreateCustomTooltip()
		{
			if (_timeRuler == null) return;

			// 이미 존재하고 부모가 있으면 스킵
			if (_customTooltip != null && _customTooltip.parent != null) return;

			// 존재하는데 부모가 없으면(Clear 등으로 떨어져 나감) 다시 붙임
			if (_customTooltip != null && _customTooltip.parent == null)
			{
				_timeRuler.Add(_customTooltip);
				return;
			}

			_customTooltip = new VisualElement();
			_customTooltip.style.position = Position.Absolute;
			_customTooltip.style.backgroundColor = new StyleColor(new Color(0.1f, 0.1f, 0.1f, 0.95f));
			_customTooltip.style.paddingLeft = 8;
			_customTooltip.style.paddingRight = 8;
			_customTooltip.style.paddingTop = 4;
			_customTooltip.style.paddingBottom = 4;
			_customTooltip.style.borderTopLeftRadius = 4;
			_customTooltip.style.borderTopRightRadius = 4;
			_customTooltip.style.borderBottomLeftRadius = 4;
			_customTooltip.style.borderBottomRightRadius = 4;
			_customTooltip.style.borderTopWidth = 1;
			_customTooltip.style.borderBottomWidth = 1;
			_customTooltip.style.borderLeftWidth = 1;
			_customTooltip.style.borderRightWidth = 1;
			_customTooltip.style.borderTopColor = new StyleColor(new Color(0.3f, 0.3f, 0.3f));
			_customTooltip.style.borderBottomColor = new StyleColor(new Color(0.3f, 0.3f, 0.3f));
			_customTooltip.style.borderLeftColor = new StyleColor(new Color(0.3f, 0.3f, 0.3f));
			_customTooltip.style.borderRightColor = new StyleColor(new Color(0.3f, 0.3f, 0.3f));
			_customTooltip.style.display = DisplayStyle.None;
			_customTooltip.pickingMode = PickingMode.Ignore; // 툴팁 자체가 레이캐스트 막지 않게

			_customTooltipLabel = new Label();
			_customTooltipLabel.style.color = Color.white;
			_customTooltipLabel.style.fontSize = 12;
			_customTooltip.Add(_customTooltipLabel);

			// _timeRuler에 추가
			_timeRuler.Add(_customTooltip);
		}

		private void ShowCustomTooltip(TimeBlock block, VisualElement target)
		{
			CreateCustomTooltip();
			if (_customTooltip == null) return;

			_customTooltipLabel.text = $"{block.Title}\n{TimeStr(block.StartMinute)} - {TimeStr(block.EndMinute)}";
			_customTooltip.style.display = DisplayStyle.Flex;
			_customTooltip.BringToFront();

			// 위치 설정 (Target의 바로 위 또는 아래)
			// worldBound 같은 절대 좌표보다는, 부모 기준 상대 좌표 사용
			// target은 _timeRuler의 자식인 dayColumn의 자식임. _customTooltip은 _timeRuler의 자식임.
			// 복잡하므로 간단하게 target의 worldBound를 _timeRuler 로컬로 변환

			// 단순화: 마우스 위치 기반이 제일 좋지만, 여기선 블록 위치 기반으로
			// target이 dayColumn 내부에 있으므로 좌표 변환 필요
			Vector2 targetPos = target.ChangeCoordinatesTo(_timeRuler, Vector2.zero);

			// 툴팁 위치: 블록의 오른쪽 위
			float tipLeft = targetPos.x + target.resolvedStyle.width + 10;
			float tipTop = targetPos.y;

			_customTooltip.style.left = tipLeft;
			_customTooltip.style.top = tipTop;
		}

		private void HideCustomTooltip()
		{
			if (_customTooltip != null) _customTooltip.style.display = DisplayStyle.None;
		}

		private string TimeStr(int m) => $"{m / 60:00}:{m % 60:00}";
		private float Snap(float value, float interval) => Mathf.Round(value / interval) * interval;

		// --- 주간 보기를 위한 드래그 앤 드롭 ---

		private int GetColumnIndex(float localX)
		{
			float axisWidth = 60f;
			if (localX < axisWidth) return -1;
			float rulerWidth = _timeRuler.contentRect.width;
			if (float.IsNaN(rulerWidth) || rulerWidth <= axisWidth) return -1;

			bool showWeekend = (_weekendToggle == null) || _weekendToggle.value;
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

		// 드래그 오프셋 상태
		private float _dragOffsetY;

		private void OnRulerPointerDown(PointerDownEvent evt)
		{
			if (_timeRuler == null) return;
			if (evt.button != 0) return;

			_timeRuler.CapturePointer(evt.pointerId);

			VisualElement target = evt.target as VisualElement;
			VisualElement hitBlock = FindAncestorBlock(target);

			float snapY = Snap(evt.localPosition.y, _snapInterval * _pixelsPerMinute);

			if (hitBlock != null)
			{
				_dragMode = DragMode.Move;
				_moveSourceBlock = hitBlock.userData as TimeBlock;
				if (_moveSourceBlock == null) { _dragMode = DragMode.None; return; }

				_dragColumnIndex = GetColumnIndex(evt.localPosition.x);

				// Offset 계산: 마우스 위치 - 블록 상단 위치
				float blockTop = _moveSourceBlock.StartMinute * _pixelsPerMinute;
				_dragOffsetY = evt.localPosition.y - blockTop;

				hitBlock.style.opacity = 0.5f;

				_ghostBlock = new VisualElement();
				_ghostBlock.AddToClassList("time-block");
				_ghostBlock.AddToClassList($"block-color-{_moveSourceBlock.ColorIndex}");
				_ghostBlock.style.position = Position.Absolute;
				_ghostBlock.style.left = 0;
				_ghostBlock.style.right = 0;

				float durationMins = _moveSourceBlock.EndMinute - _moveSourceBlock.StartMinute;
				float height = durationMins * _pixelsPerMinute;

				// 고스트 초기 위치 = 현재 블록 위치
				_ghostBlock.style.top = blockTop;
				_ghostBlock.style.height = height;

				if (_dragColumnIndex >= 0 && _dragColumnIndex < _dayColumns.Count)
					_dayColumns[_dragColumnIndex].Add(_ghostBlock);
			}
			else
			{
				int colIndex = GetColumnIndex(evt.localPosition.x);
				if (colIndex == -1)
				{
					_dragMode = DragMode.None;
					return;
				}

				_dragMode = DragMode.Create;
				_dragColumnIndex = colIndex;
				_dragStartY = snapY;

				_ghostBlock = new VisualElement();
				_ghostBlock.AddToClassList("time-block");
				_ghostBlock.style.backgroundColor = new StyleColor(new Color(1f, 1f, 1f, 0.3f));
				_ghostBlock.style.position = Position.Absolute;
				_ghostBlock.style.top = _dragStartY;
				_ghostBlock.style.height = 0;
				_ghostBlock.style.left = 0;
				_ghostBlock.style.right = 0;

				_dayColumns[colIndex].Add(_ghostBlock);
			}
		}

		private void OnRulerPointerMove(PointerMoveEvent evt)
		{
			// ... (Resize logic skipped, assumming separate or same method) ...
			if (_isResizing)
			{
				// 리사이즈 로직 (기존 유지)
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
						float currentTop = _resizingVisual.style.top.value.value;
						float maxBottom = 24 * 60 * _pixelsPerMinute;
						if (currentTop + newHeight > maxBottom) newHeight = maxBottom - currentTop;
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
				// Offset 적용하여 Top 계산
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
					// Resize Commit Logic (Keep as is)
					float finalTop = _resizingVisual.style.top.value.value;
					float finalHeight = _resizingVisual.style.height.value.value;
					int startMin = Mathf.RoundToInt(finalTop / _pixelsPerMinute);
					int endMin = Mathf.RoundToInt((finalTop + finalHeight) / _pixelsPerMinute);
					int interval = (int)_snapInterval;
					startMin = Mathf.RoundToInt((float)startMin / interval) * interval;
					endMin = Mathf.RoundToInt((float)endMin / interval) * interval;
					if (endMin <= startMin) endMin = startMin + interval;
					if (endMin > 1440) endMin = 1440;
					// No-Op Check
					if (startMin == _resizingBlock.StartMinute && endMin == _resizingBlock.EndMinute)
					{
						_isResizing = false; _resizingBlock = null; _resizingVisual = null;
						return;
					}

					_resizingBlock.StartMinute = startMin;
					_resizingBlock.EndMinute = endMin;

					bool isTransient = !_data.TimeBlocks.Contains(_resizingBlock);
					if (isTransient)
					{
						// Recurring Block Resize -> Treat as Move (Same Date, New Times)
						RequestRecurrenceMove(_resizingBlock, _resizingBlock.DateString, startMin, endMin);
					}
					else
					{
						SaveData();
						RefreshSchedule();
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

				if (_dragMode == DragMode.Create)
				{
					if (height >= _snapInterval && endMin > startMin)
					{
						int offset = (int)_dayColumns[_dragColumnIndex].userData;
						DateTime targetDate = _currentDate.AddDays(offset);
						// 기본값 1시간 설정 등
						if (endMin - startMin < 30) endMin = startMin + 30;
						_data.TimeBlocks.Add(new TimeBlock(targetDate.ToString("yyyy-MM-dd"), startMin, endMin, "New Event"));
						SaveData();
					}
				}
				else if (_dragMode == DragMode.Move && _moveSourceBlock != null)
				{
					if (endMin > startMin && _dragColumnIndex != -1)
					{
						int offset = (int)_dayColumns[_dragColumnIndex].userData;
						DateTime targetDate = _currentDate.AddDays(offset);
						string targetDateStr = targetDate.ToString("yyyy-MM-dd");

						// No-Op Check
						// 날짜, 시작시간, 종료시간이 모두 같으면 변경 없음
						// 주의: Transient 블록의 경우 DateString이 실제 날짜와 다를 수 있으므로(Master의 날짜일 수 있음),
						// 현재 _moveSourceBlock이 화면에 표시된 날짜와 비교해야 함. 
						// 하지만 _moveSourceBlock은 데이터 객체임. 
						// Transient 블록은 생성 시점에 DateString을 해당 날짜로 덮어씌워서 생성함 (Schedule.cs 184라인 참조)
						// 따라서 DateString 비교가 유효함.

						if (_moveSourceBlock.StartMinute == startMin &&
							_moveSourceBlock.EndMinute == endMin &&
							_moveSourceBlock.DateString == targetDateStr)
						{
							_dragMode = DragMode.None;
							_moveSourceBlock = null;
							_dragColumnIndex = -1;
							RefreshSchedule(); // 고스트 제거 등을 위해 리프레시 (사실 위에서 Remove 했지만 안전하게)
							return;
						}

						bool isTransient = !_data.TimeBlocks.Contains(_moveSourceBlock);
						if (isTransient)
						{
							// Recurring Block Move -> Ask User
							RequestRecurrenceMove(_moveSourceBlock, targetDateStr, startMin, endMin);
						}
						else
						{
							// Normal Move
							_moveSourceBlock.DateString = targetDateStr;
							_moveSourceBlock.StartMinute = startMin;
							_moveSourceBlock.EndMinute = endMin;
							SaveData();
						}
					}
				}
				RefreshSchedule();
			}

			_dragMode = DragMode.None;
			_moveSourceBlock = null;
			_dragColumnIndex = -1;
		}
	}
}