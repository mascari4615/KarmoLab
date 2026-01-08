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

        // --- Schedule Logic (Week View) ---
        private void ChangeWeek(int offset)
        {
            _currentDate = _currentDate.AddDays(offset);
            AdjustCurrentDateToStartOfWeek(); // Ensure alignment
            RefreshSchedule();
        }

        private void BuildTimeRuler()
        {
            _timeRuler.Clear();
            _dayColumns.Clear();

            // Set explicit height for drag area based on scale
            _timeRuler.style.height = 24 * 60 * _pixelsPerMinute;

            // 1. Time Axis (Leftmost)
            _timeAxis = new VisualElement();
            _timeAxis.AddToClassList("time-axis");
            for (int i = 0; i < 24; i++) // 24 hours
            {
                var label = new Label($"{i:00}:00");
                label.AddToClassList("hour-label");
                label.style.top = i * 60 * _pixelsPerMinute;
                _timeAxis.Add(label);
            }
            _timeRuler.Add(_timeAxis);

            // 2. Day Columns (7 days)
            for (int i = 0; i < 7; i++)
            {
                var dayCol = new VisualElement();
                dayCol.AddToClassList("day-column");
                dayCol.name = $"DayColumn_{i}";

                // Header (Date)
                var header = new Label("Date");
                header.AddToClassList("day-header");
                header.name = "Header";
                dayCol.Add(header);

                // Grid Lines inside each column for easier reading
                for (int h = 0; h < 24; h++)
                {
                    var line = new VisualElement();
                    line.AddToClassList("hour-line");
                    line.style.top = h * 60 * _pixelsPerMinute;
                    dayCol.Add(line);
                }

                _dayColumns.Add(dayCol);
                _timeRuler.Add(dayCol);
            }
        }

        private void RefreshSchedule()
        {
            if (_timeRuler == null || _dayColumns.Count != 7) return;

            // Make sure container height matches current scale
            _timeRuler.style.height = 24 * 60 * _pixelsPerMinute;

            // Ensure _currentDate is Start of Week ?? User might want rolling 7 days or aligned to Sunday/Monday
            // For now, let's treat _currentDate as the starting day of the view.

            DateTime endWeek = _currentDate.AddDays(6);
            if (_schedDateLabel != null)
                _schedDateLabel.text = $"{_currentDate:yyyy-MM-dd} ~ {endWeek:yyyy-MM-dd}";

            BuildTimeRuler();

            // Collect Tags
            HashSet<string> allTags = new HashSet<string>();
            foreach(var b in _data.TimeBlocks)
            {
                if (b.Tags != null) foreach(var t in b.Tags) allTags.Add(t);
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

            for (int i = 0; i < 7; i++)
            {
                var col = _dayColumns[i];
                var targetDate = _currentDate.AddDays(i);
                var header = col.Q<Label>("Header");
                if (header != null) 
                    header.text = targetDate.ToString("MM/dd (ddd)");

                // Filter Blocks
                var dateStr = targetDate.ToString("yyyy-MM-dd");
                var blocks = _data.TimeBlocks
                    .Where(b => b.DateString == dateStr)
                    .Where(b => !useFilter || (b.Tags != null && b.Tags.Contains(filterTag)))
                    .OrderBy(b => b.StartMinute)
                    .ThenByDescending(b => b.EndMinute)
                    .ToList();
                
                if (blocks.Count == 0) continue;

                // Cluster Logic per column
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

        private VisualElement CreateBlockVisual(TimeBlock block)
        {
            var visualBlock = new VisualElement();
            visualBlock.AddToClassList("time-block");
            visualBlock.AddToClassList($"block-color-{block.ColorIndex}");
            visualBlock.style.position = Position.Absolute;
            visualBlock.userData = block;

            // Title
            var titleLabel = new Label(block.Title);
            titleLabel.AddToClassList("time-block-title");
            visualBlock.Add(titleLabel);

            // Time
            var timeLabel = new Label($"{TimeStr(block.StartMinute)} - {TimeStr(block.EndMinute)}");
            timeLabel.AddToClassList("time-block-time");
            visualBlock.Add(timeLabel);

            // "..." Button
            var moreBtn = new Button(() => {
                 ShowDetailPopup(block, visualBlock);
            });
            moreBtn.text = "...";
            moreBtn.AddToClassList("time-block-btn");
            visualBlock.Add(moreBtn);

            return visualBlock;
        }

        private string TimeStr(int m) => $"{m/60:00}:{m%60:00}";
        private float Snap(float value, float interval) => Mathf.Round(value / interval) * interval;

        // --- Drag & Drop for Week View ---

        private int GetColumnIndex(float localX)
        {
            float axisWidth = 60f;
            if (localX < axisWidth) return -1;
            float rulerWidth = _timeRuler.contentRect.width;
            if (float.IsNaN(rulerWidth) || rulerWidth <= axisWidth) return -1;
            float columnWidth = (rulerWidth - axisWidth) / 7f;
            int colIndex = Mathf.FloorToInt((localX - axisWidth) / columnWidth);
            if (colIndex < 0 || colIndex >= 7) return -1;
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
            
            // Capture for both Create and Move
            _timeRuler.CapturePointer(evt.pointerId);
            
            // Check if clicking existing block
            VisualElement target = evt.target as VisualElement;
            VisualElement hitBlock = FindAncestorBlock(target);

            // Determine Snap Y
            float snapY = Snap(evt.localPosition.y, _snapInterval * _pixelsPerMinute);

            if (hitBlock != null)
            {
                // MOVE MODE
                _dragMode = DragMode.Move;
                _moveSourceBlock = hitBlock.userData as TimeBlock;
                if (_moveSourceBlock == null) { _dragMode = DragMode.None; return; }

                // Determine column from UI position (more reliable during move)
                // Note: localPosition.x is relative to _timeRuler.
                _dragColumnIndex = GetColumnIndex(evt.localPosition.x);

                // Hide Original
                hitBlock.style.opacity = 0.5f; 

                // Create Ghost
                _ghostBlock = new VisualElement();
                _ghostBlock.AddToClassList("time-block");
                _ghostBlock.AddToClassList($"block-color-{_moveSourceBlock.ColorIndex}");
                _ghostBlock.style.position = Position.Absolute;
                _ghostBlock.style.left = 0; 
                _ghostBlock.style.right = 0;
                
                float durationMins = _moveSourceBlock.EndMinute - _moveSourceBlock.StartMinute;
                float height = durationMins * _pixelsPerMinute;
                
                // Align ghost precisely to where the block WAS (snapped)
                _dragStartY = _moveSourceBlock.StartMinute * _pixelsPerMinute; 
                
                _ghostBlock.style.top = _dragStartY;
                _ghostBlock.style.height = height;
                
                // Add ghost to current column
                if (_dragColumnIndex >= 0 && _dragColumnIndex < _dayColumns.Count)
                    _dayColumns[_dragColumnIndex].Add(_ghostBlock);
            }
            else
            {
                // CREATE MODE (Only if Valid Column)
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
            if (_dragMode == DragMode.None || _ghostBlock == null) return;

            float currentY = Snap(evt.localPosition.y, _snapInterval * _pixelsPerMinute);
            int curColIndex = GetColumnIndex(evt.localPosition.x);
            
            if (_dragMode == DragMode.Create)
            {
                // Create Logic: Fixed start point, stretch height
                float top = Mathf.Min(_dragStartY, currentY);
                float height = Mathf.Abs(currentY - _dragStartY);
                _ghostBlock.style.top = top;
                _ghostBlock.style.height = height;
            }
            else if (_dragMode == DragMode.Move)
            {
                // Move Logic: Fixed height, move Top
                // Detect Column Change
                if (curColIndex != -1 && curColIndex != _dragColumnIndex && curColIndex < _dayColumns.Count)
                {
                    // Reparent Ghost
                    _ghostBlock.parent.Remove(_ghostBlock);
                    _dayColumns[curColIndex].Add(_ghostBlock);
                    _dragColumnIndex = curColIndex;
                }
                
                // Update Y
                _ghostBlock.style.top = currentY; 
            }
        }

        private void OnRulerPointerUp(IPointerEvent evt)
        {
            if (_dragMode == DragMode.None) return;
            
            if (_timeRuler != null && evt is PointerUpEvent upEvt) 
                _timeRuler.ReleasePointer(upEvt.pointerId);

            if (_ghostBlock != null)
            {
                float top = _ghostBlock.style.top.value.value;
                float height = _ghostBlock.style.height.value.value;
                
                _ghostBlock.parent.Remove(_ghostBlock);
                _ghostBlock = null;

                int startMin = Mathf.RoundToInt(top / _pixelsPerMinute);
                int endMin = Mathf.RoundToInt((top + height) / _pixelsPerMinute);
                if (startMin < 0) startMin = 0;
                if (endMin > 24 * 60) endMin = 24 * 60; // 24:00

                if (_dragMode == DragMode.Create)
                {
                    if (height >= _snapInterval && endMin > startMin)
                    {
                         DateTime targetDate = _currentDate.AddDays(_dragColumnIndex); 
                        _data.TimeBlocks.Add(new TimeBlock(targetDate.ToString("yyyy-MM-dd"), startMin, endMin, "New Event"));
                        SaveData();
                    }
                }
                else if (_dragMode == DragMode.Move && _moveSourceBlock != null)
                {
                    // Commit Move
                    if (endMin > startMin && _dragColumnIndex != -1)
                    {
                         DateTime targetDate = _currentDate.AddDays(_dragColumnIndex); // New Date logic
                         _moveSourceBlock.DateString = targetDate.ToString("yyyy-MM-dd");
                         _moveSourceBlock.StartMinute = startMin;
                         _moveSourceBlock.EndMinute = endMin;
                         SaveData();
                    }
                }
                RefreshSchedule(); // Rebuilds everything
            }
            
            _dragMode = DragMode.None;
            _moveSourceBlock = null;
            _dragColumnIndex = -1;
        }
    }
}