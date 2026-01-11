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
				var blocks = _data.TimeBlocks
					.Where(b => b.DateString == dateStr)
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
							var visual = CreateBlockVisual(block);
							float top = block.StartMinute * _pixelsPerMinute;
							float height = (block.EndMinute - block.StartMinute) * _pixelsPerMinute;
							if (height < 20) height = 20;

							visual.style.top = top;
							visual.style.height = height;
							visual.style.left = Length.Percent(100f / totalClusterCols * c);
							visual.style.width = Length.Percent(100f / totalClusterCols);

							col.Add(visual);
						}
					}
				}
			}
		}

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

		private VisualElement CreateBlockVisual(TimeBlock block)
		{
			var visualBlock = new VisualElement();
			visualBlock.AddToClassList("time-block");
			visualBlock.AddToClassList($"block-color-{block.ColorIndex}");
			visualBlock.style.position = Position.Absolute;
			visualBlock.userData = block;

			// 제목
			var titleLabel = new Label(block.Title);
			titleLabel.AddToClassList("time-block-title");
			visualBlock.Add(titleLabel);

			// 시간
			var timeLabel = new Label($"{TimeStr(block.StartMinute)} - {TimeStr(block.EndMinute)}");
			timeLabel.AddToClassList("time-block-time");
			visualBlock.Add(timeLabel);

			// "..." 버튼
			var moreBtn = new Button(() =>
			{
				ShowDetailPopup(block, visualBlock);
			});
			moreBtn.text = "...";
			moreBtn.AddToClassList("time-block-btn");
			visualBlock.Add(moreBtn);

			// -- 크기 조정 핸들 --
			var resizeTop = new VisualElement();
			resizeTop.name = "ResizeTop";
			resizeTop.style.position = Position.Absolute;
			resizeTop.style.top = 0;
			resizeTop.style.left = 0;
			resizeTop.style.right = 0;
			resizeTop.style.height = 8; // 히트박스
			resizeTop.style.cursor = new StyleCursor(StyleKeyword.None); // 필요한 경우 USS가 커서를 처리하도록 함
			resizeTop.RegisterCallback<PointerDownEvent>(evt => OnResizeStart(evt, block, visualBlock, true));
			visualBlock.Add(resizeTop);

			var resizeBottom = new VisualElement();
			resizeBottom.name = "ResizeBottom";
			resizeBottom.style.position = Position.Absolute;
			resizeBottom.style.bottom = 0;
			resizeBottom.style.left = 0;
			resizeBottom.style.right = 0;
			resizeBottom.style.height = 8; // 히트박스
			resizeBottom.RegisterCallback<PointerDownEvent>(evt => OnResizeStart(evt, block, visualBlock, false));
			visualBlock.Add(resizeBottom);

			return visualBlock;
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

		private void OnRulerPointerDown(PointerDownEvent evt)
		{
			if (_timeRuler == null) return;
			if (evt.button != 0) return;

			// 생성과 이동 모두에 대해 포착
			_timeRuler.CapturePointer(evt.pointerId);

			// 기존 블록을 클릭했는지 확인
			VisualElement target = evt.target as VisualElement;
			VisualElement hitBlock = FindAncestorBlock(target);

			// 스냅 Y 결정
			float snapY = Snap(evt.localPosition.y, _snapInterval * _pixelsPerMinute);

			if (hitBlock != null)
			{
				// 이동 모드
				_dragMode = DragMode.Move;
				_moveSourceBlock = hitBlock.userData as TimeBlock;
				if (_moveSourceBlock == null) { _dragMode = DragMode.None; return; }

				// UI 위치에서 열 결정 (이동 중 더 신뢰성 있음)
				// 참고: localPosition.x는 _timeRuler에 상대적임.
				_dragColumnIndex = GetColumnIndex(evt.localPosition.x);

				// 원본 숨기기
				hitBlock.style.opacity = 0.5f;

				// 고스트 생성
				_ghostBlock = new VisualElement();
				_ghostBlock.AddToClassList("time-block");
				_ghostBlock.AddToClassList($"block-color-{_moveSourceBlock.ColorIndex}");
				_ghostBlock.style.position = Position.Absolute;
				_ghostBlock.style.left = 0;
				_ghostBlock.style.right = 0;

				float durationMins = _moveSourceBlock.EndMinute - _moveSourceBlock.StartMinute;
				float height = durationMins * _pixelsPerMinute;

				// 블록이 있던 위치에 고스트 정확히 정렬 (스냅된 상태)
				_dragStartY = _moveSourceBlock.StartMinute * _pixelsPerMinute;

				_ghostBlock.style.top = _dragStartY;
				_ghostBlock.style.height = height;

				// 현재 열에 고스트 추가
				if (_dragColumnIndex >= 0 && _dragColumnIndex < _dayColumns.Count)
					_dayColumns[_dragColumnIndex].Add(_ghostBlock);
			}
			else
			{
				// 생성 모드 (유효한 열인 경우에만)
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
			// --- 크기 조정 로직 ---
			if (_isResizing && _resizingVisual != null)
			{
				float deltaY = evt.position.y - _resizeStartMouseY;

				if (_isResizeTop)
				{
					// Top & Height 수정 (반대)
					float newTop = _resizeStartBlockTop + deltaY;
					float newHeight = _resizeStartBlockHeight - deltaY;

					// 제약 조건
					float minHeight = _snapInterval * _pixelsPerMinute;
					if (newHeight < minHeight)
					{
						newHeight = minHeight;
						newTop = (_resizeStartBlockTop + _resizeStartBlockHeight) - minHeight;
					}
					if (newTop < 0)
					{
						newTop = 0;
						newHeight = _resizeStartBlockTop + _resizeStartBlockHeight;
					}

					_resizingVisual.style.top = newTop;
					_resizingVisual.style.height = newHeight;
				}
				else
				{
					// 높이만 수정
					float newHeight = _resizeStartBlockHeight + deltaY;
					float minHeight = _snapInterval * _pixelsPerMinute;
					if (newHeight < minHeight) newHeight = minHeight;

					// 최대 제한 (24:00)
					float currentTop = _resizingVisual.style.top.value.value;
					float maxBottom = 24 * 60 * _pixelsPerMinute;
					if (currentTop + newHeight > maxBottom) newHeight = maxBottom - currentTop;

					_resizingVisual.style.height = newHeight;
				}
				evt.StopPropagation();
				return;
			}

			if (_dragMode == DragMode.None || _ghostBlock == null) return;

			float currentY = Snap(evt.localPosition.y, _snapInterval * _pixelsPerMinute);
			int curColIndex = GetColumnIndex(evt.localPosition.x);

			if (_dragMode == DragMode.Create)
			{
				// 생성 로직: 시작점 고정, 높이 늘리기
				float top = Mathf.Min(_dragStartY, currentY);
				float height = Mathf.Abs(currentY - _dragStartY);
				_ghostBlock.style.top = top;
				_ghostBlock.style.height = height;
			}
			else if (_dragMode == DragMode.Move)
			{
				// 이동 로직: 높이 고정, Top 이동
				// 열 변경 감지
				if (curColIndex != -1 && curColIndex != _dragColumnIndex && curColIndex < _dayColumns.Count)
				{
					// 고스트 부모 변경
					_ghostBlock.parent?.Remove(_ghostBlock);
					_dayColumns[curColIndex].Add(_ghostBlock);
					_dragColumnIndex = curColIndex;
				}

				// Y 업데이트
				_ghostBlock.style.top = currentY;
			}
		}

		private void OnRulerPointerUp(IPointerEvent evt)
		{
			// --- 크기 조정 커밋 ---
			if (_isResizing)
			{
				if (_timeRuler != null && evt is PointerUpEvent upEvt)
					_timeRuler.ReleasePointer(upEvt.pointerId);

				if (_resizingVisual != null && _resizingBlock != null)
				{
					float finalTop = _resizingVisual.style.top.value.value;
					float finalHeight = _resizingVisual.style.height.value.value;

					// 분 단위로 다시 변환
					int startMin = Mathf.RoundToInt(finalTop / _pixelsPerMinute);
					int endMin = Mathf.RoundToInt((finalTop + finalHeight) / _pixelsPerMinute);

					// 스냅
					int interval = (int)_snapInterval;
					startMin = Mathf.RoundToInt((float)startMin / interval) * interval;
					endMin = Mathf.RoundToInt((float)endMin / interval) * interval;

					// 유효성 검사
					if (endMin <= startMin) endMin = startMin + interval;
					if (endMin > 1440) endMin = 1440;

					_resizingBlock.StartMinute = startMin;
					_resizingBlock.EndMinute = endMin;

					SaveData();
					RefreshSchedule(); // 깨끗한 상태를 보장하기 위해 전체 다시 그리기
				}

				_isResizing = false;
				_resizingBlock = null;
				_resizingVisual = null;
				return;
			}

			if (_dragMode == DragMode.None) return;

			if (_timeRuler != null && evt is PointerUpEvent upEvt2)
				_timeRuler.ReleasePointer(upEvt2.pointerId);

			if (_ghostBlock != null)
			{
				float top = _ghostBlock.style.top.value.value;
				float height = _ghostBlock.style.height.value.value;

				_ghostBlock.parent?.Remove(_ghostBlock);
				_ghostBlock = null;

				int startMin = Mathf.RoundToInt(top / _pixelsPerMinute);
				int endMin = Mathf.RoundToInt((top + height) / _pixelsPerMinute);
				if (startMin < 0) startMin = 0;
				if (endMin > 24 * 60) endMin = 24 * 60; // 24:00

				if (_dragMode == DragMode.Create)
				{
					if (height >= _snapInterval && endMin > startMin)
					{
						int offset = (int)_dayColumns[_dragColumnIndex].userData;
						DateTime targetDate = _currentDate.AddDays(offset);
						_data.TimeBlocks.Add(new TimeBlock(targetDate.ToString("yyyy-MM-dd"), startMin, endMin, "New Event"));
						SaveData();
					}
				}
				else if (_dragMode == DragMode.Move && _moveSourceBlock != null)
				{
					// 이동 커밋
					if (endMin > startMin && _dragColumnIndex != -1)
					{
						int offset = (int)_dayColumns[_dragColumnIndex].userData;
						DateTime targetDate = _currentDate.AddDays(offset); // 올바른 날짜 로직
						_moveSourceBlock.DateString = targetDate.ToString("yyyy-MM-dd");
						_moveSourceBlock.StartMinute = startMin;
						_moveSourceBlock.EndMinute = endMin;
						SaveData();
					}
				}
				RefreshSchedule(); // 모든 것을 다시 빌드
			}

			_dragMode = DragMode.None;
			_moveSourceBlock = null;
			_dragColumnIndex = -1;
		}
	}
}