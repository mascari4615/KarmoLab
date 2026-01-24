using System;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager.Timeline
{
	[AddComponentMenu("KarmoToys/Features/TimelineFeature")]
	public class TimelineFeature : ProjectViewBase
	{
		public override string FeatureName => "Timeline";

		// No TabButtonName, it is a sub-view of ProjectManager (managed by ProjectManagerFeature)
		public override string TabButtonName => "";

		private VisualElement _container;
		private VisualElement _timelineCanvas;
		private VisualElement _sidebar; // Changed from ScrollView
		private Button _btnAddItem;

		// Settings
		private float _pixelsPerDay = 100f;
		private DateTime _startDateBase = DateTime.Today.AddDays(-7); // View starts 7 days ago

		private VisualElement _timelineRuler;
		private Vector2 _canvasDragStart;
		private bool _isCanvasDragging;

		public override void Initialize(VisualElement root)
		{
			ViewContainer = root;

			_container = root.Q("TimelineContainer");
			_timelineCanvas = root.Q("TimelineCanvas");
			_timelineRuler = root.Q("TimelineRuler");
			_sidebar = root.Q("TimelineSidebar"); // Default Q returns VisualElement
			_btnAddItem = root.Q<Button>("BtnAddTimelineItem");

			// Auto Render on Resize/Show
			_timelineCanvas.RegisterCallback<GeometryChangedEvent>(OnCanvasGeometryChanged);

			// Zoom Support (Capture phase to intercept before ScrollView)
			_container.RegisterCallback<WheelEvent>(OnWheel, TrickleDown.TrickleDown);

			Debug.Log($"[TimelineFeature] Init Query Result: Container={_container != null}, Canvas={_timelineCanvas != null}, Ruler={_timelineRuler != null}, Sidebar={_sidebar != null}");

			if (_btnAddItem != null)
				_btnAddItem.clicked += OnAddNewItem;

			// Panning Logic (Infinite Scroll)
			_timelineCanvas.RegisterCallback<MouseDownEvent>(OnCanvasMouseDown);
			_timelineCanvas.RegisterCallback<MouseMoveEvent>(OnCanvasMouseMove);
			_timelineCanvas.RegisterCallback<MouseUpEvent>(OnCanvasMouseUp);
			// Auto Render on Resize/Show
			_timelineCanvas.RegisterCallback<GeometryChangedEvent>(OnCanvasGeometryChanged);

			Debug.Log("[TimelineFeature] Initialized.");

			// Initial Render (might be hidden, relying on GeometryChanged for actual layout-dependent render)
			Refresh();
		}

		private void OnWheel(WheelEvent evt)
		{
			// Shift + Scroll: Horizontal Panning
			if (evt.shiftKey)
			{
				float panSpeed = 10f; // Scale factor
				float delta = evt.delta.y * panSpeed; // Scroll Down (Pos) -> Move Right (Future) -> Add Days
													  // Actually UI scroll down usually moves content up (view moves down). 
													  // Convention: Scroll Down -> Pan Right (Future)
													  // DeltaY > 0 -> Add Days

				float daysShift = delta / _pixelsPerDay;
				_startDateBase = _startDateBase.AddDays(daysShift);

				RenderTimeline();
				evt.StopPropagation();
				return;
			}

			// Ctrl + Scroll: Zoom
			if (evt.ctrlKey)
			{
				// 1. Calculate Mouse Date BEFORE Zoom
				// Mouse position relative to canvas content area? 
				// We need local position in the ScrollView/Content.
				// However, OnWheel comes from Container.
				// Let's assume evt.localMousePosition is relative to Container. 
				// Sidebar width is fixed ~200px? No, we need precise offset.
				// More robust: Calculate Mouse offset from TimelineCanvas left edge.

				float mouseX = evt.mousePosition.x - _timelineCanvas.worldBound.x; // World space diff
																				   // Or use local if target is canvas. Event bubble from container.
																				   // Simplest: MouseX relative to screen -> conversion.
																				   // Let's rely on `evt.mousePosition` being in Panel space, and `_timelineCanvas.worldBound.x`.

				float offsetPixels = mouseX;
				double offsetDays = offsetPixels / _pixelsPerDay;
				DateTime pivotDate = _startDateBase.AddDays(offsetDays);

				float zoomSpeed = 0.1f;
				float delta = -evt.delta.y * zoomSpeed;

				// 2. Adjust Scale
				float multiplier = 1f + (delta * 0.5f);
				float newPixelsPerDay = _pixelsPerDay * multiplier;
				newPixelsPerDay = Mathf.Clamp(newPixelsPerDay, 10f, 2000f);

				if (Math.Abs(newPixelsPerDay - _pixelsPerDay) < 0.01f) return;

				_pixelsPerDay = newPixelsPerDay;

				// 3. Compensate StartDate so Pivot Date remains at MouseX
				// newOffsetDays = offsetPixels / newScale
				// StartDate = PivotDate - newOffsetDays

				double newOffsetDays = offsetPixels / _pixelsPerDay;
				_startDateBase = pivotDate.AddDays(-newOffsetDays);

				RenderTimeline();
				evt.StopPropagation();
			}
		}

		private void OnCanvasGeometryChanged(GeometryChangedEvent evt)
		{
			// Only re-render if width changed significantly or became visible
			if (evt.newRect.width > 0 && Math.Abs(evt.newRect.width - evt.oldRect.width) > 1f)
			{
				RenderTimeline();
			}
		}

		// ... OnSelect ...

		private void OnCanvasMouseDown(MouseDownEvent evt)
		{
			// Allow dragging if target is Canvas or any background row
			// Avoid dragging if target is a TimelineItem (which handles its own drag)
			// TimelineItem has manipulator which captures mouse, so this might not even fire if they consume it.
			// But to be safe:

			if (evt.target is VisualElement el && el.ClassListContains("timeline-bar")) return;

			// Start Panning
			_isCanvasDragging = true;
			_canvasDragStart = evt.mousePosition;
			_timelineCanvas.CaptureMouse();
		}

		private void OnCanvasMouseMove(MouseMoveEvent evt)
		{
			if (!_isCanvasDragging) return;

			float deltaX = evt.mousePosition.x - _canvasDragStart.x;
			_canvasDragStart = evt.mousePosition;

			// Shift Base Date (Inverse: Drag Left -> Move Future -> Date increases)
			// DeltaX > 0 (Drag Right) -> Move Past -> Date decreases

			float daysShift = -deltaX / _pixelsPerDay;
			_startDateBase = _startDateBase.AddDays(daysShift);

			RenderTimeline();
		}

		private void OnCanvasMouseUp(MouseUpEvent evt)
		{
			_isCanvasDragging = false;
			_timelineCanvas.ReleaseMouse();
		}

		private void OnCanvasWheel(WheelEvent evt)
		{
			// Optional: Zoom (Change PixelsPerDay)
			if (evt.ctrlKey)
			{
				_pixelsPerDay -= evt.delta.y;
				if (_pixelsPerDay < 20) _pixelsPerDay = 20;
				if (_pixelsPerDay > 500) _pixelsPerDay = 500;
				evt.StopPropagation();
				RenderTimeline();
			}
			else
			{
				// Vertical scroll handled by parent? or manual horizontal scroll?
				// Let's allow wheel to pan horizontally if Shift is held
				if (evt.shiftKey)
				{
					float daysShift = evt.delta.y * 0.1f; // Sensitivity
					_startDateBase = _startDateBase.AddDays(daysShift);
					RenderTimeline();
					evt.StopPropagation();
				}
			}
		}

		public override void Refresh()
		{
			RenderTimeline();
		}

		private void RenderTimeline()
		{
			try
			{
				if (_timelineCanvas == null) { Debug.LogError("TimelineCanvas is null!"); return; }
				if (_sidebar == null) { Debug.LogError("TimelineSidebar is null!"); return; }
				if (_timelineRuler == null) { Debug.LogError("TimelineRuler is null!"); return; }

				_timelineCanvas.Clear();
				_sidebar.Clear();
				_timelineRuler.Clear();

				// --- 1. Render Ruler ---
				RenderRuler();

				// --- 2. Render Items ---
				var items = KarmoToysApp.Instance.Data.ProjectItems;
				Debug.Log($"[TimelineFeature] Rendering {items.Count} items to canvas.");

				int rowIndex = 0;
				float rowHeight = 30f;

				foreach (var item in items)
				{
					string rowClass = (rowIndex % 2 == 0) ? "timeline-row-even" : "timeline-row-odd";

					// Sidebar
					var label = new Label(item.Title);
					label.AddToClassList("timeline-item-row");
					label.AddToClassList("timeline-sidebar-item"); // Helper
					label.AddToClassList(rowClass); // Striping

					// Re-apply Absolute Positioning for precise alignment
					label.style.position = Position.Absolute;
					label.style.top = rowIndex * rowHeight;
					label.style.height = rowHeight;
					label.style.left = 0;
					label.style.right = 0;

					// Reset margins to prevent offset/drift
					label.style.marginTop = 0;
					label.style.marginBottom = 0;
					label.style.marginLeft = 0;
					label.style.marginRight = 0;
					label.style.paddingTop = 0;
					label.style.paddingBottom = 0;

					// Reorder Manipulator (Capture index for closure)
					int captureIndex = rowIndex;
					label.AddManipulator(new SidebarReorderManipulator(rowHeight, captureIndex, OnItemReordered));

					label.style.paddingLeft = 10;
					label.style.unityTextAlign = TextAnchor.MiddleLeft;
					_sidebar.Add(label);

					// Canvas Background Row (for striping across canvas)
					var bgRow = new VisualElement();
					bgRow.AddToClassList("timeline-row-bg");
					bgRow.AddToClassList(rowClass);
					bgRow.style.top = rowIndex * rowHeight;
					_timelineCanvas.Add(bgRow);

					// Bar
					CreateBar(item, rowIndex * rowHeight);
					rowIndex++;
				}

				// Adjust Container Height (Both Sidebar and Canvas need enough height)
				float totalHeight = rowIndex * rowHeight + 100;
				_timelineCanvas.style.height = totalHeight;
				_sidebar.style.height = totalHeight;
			}
			catch (Exception ex)
			{
				Debug.LogError($"[TimelineFeature] RenderTimeline Error: {ex}");
			}
		}

		private void OnItemReordered(int fromIndex, int toIndex)
		{
			var items = KarmoToysApp.Instance.Data.ProjectItems;

			// Bounds Check
			if (toIndex < 0) toIndex = 0;
			if (toIndex >= items.Count) toIndex = items.Count - 1;

			if (fromIndex == toIndex)
			{
				RenderTimeline(); // Reset position visually
				return;
			}

			// Move Item
			var item = items[fromIndex];
			items.RemoveAt(fromIndex);
			items.Insert(toIndex, item);

			KarmoToysApp.Instance.SaveData();

			// Refresh View
			RenderTimeline();
		}

		private void RenderRuler()
		{
			float screenWidth = _timelineCanvas.resolvedStyle.width;
			if (float.IsNaN(screenWidth) || screenWidth < 100) screenWidth = 2000;

			int daysToRender = Mathf.CeilToInt(screenWidth / _pixelsPerDay) + 2;
			DateTime loopDay = _startDateBase.Date;

			// LOD Logic
			bool showSixHours = _pixelsPerDay > 150;
			bool showOneHour = _pixelsPerDay > 400;

			for (int i = -1; i < daysToRender; i++)
			{
				DateTime day = loopDay.AddDays(i);
				float dayOffset = (float)(day - _startDateBase).TotalDays * _pixelsPerDay;

				// 1. Day Tick (Major)
				DrawTick(dayOffset, 15, "timeline-ruler-tick");

				// Label
				var label = new Label($"{day.Month}/{day.Day} ({day.DayOfWeek.ToString().Substring(0, 3)})");
				label.AddToClassList("timeline-ruler-label");
				label.style.left = dayOffset + 5;
				_timelineRuler.Add(label);

				// Grid line (Day)
				DrawGridLine(dayOffset, 1f, 0.05f);

				// 2. Sub-ticks (Hours)
				if (showSixHours)
				{
					int step = showOneHour ? 1 : 6;
					for (int h = step; h < 24; h += step)
					{
						float hourOffset = dayOffset + (h / 24f * _pixelsPerDay);

						// Tick Style
						string tickClass = (h % 6 == 0) ? "timeline-ruler-tick" : "timeline-ruler-tick-minor";
						float tickHeight = (h % 6 == 0) ? 10 : 6;

						DrawTick(hourOffset, tickHeight, tickClass);

						// Hour Label (only for 6h increments or if super zoomed)
						if (h % 6 == 0 || _pixelsPerDay > 600)
						{
							var hourLabel = new Label($"{h}h");
							hourLabel.AddToClassList("timeline-ruler-label");
							hourLabel.style.fontSize = 9;
							hourLabel.style.color = new StyleColor(new Color(1, 1, 1, 0.3f));
							hourLabel.style.left = hourOffset + 2;
							hourLabel.style.top = 10;
							_timelineRuler.Add(hourLabel);
						}
					}
				}
			}
		}

		private void DrawTick(float pos, float height, string className)
		{
			var tick = new VisualElement();
			tick.AddToClassList(className); // "timeline-ruler-tick" or "timeline-ruler-tick-minor"
			tick.style.left = pos;
			tick.style.height = height;
			_timelineRuler.Add(tick);
		}

		private void DrawGridLine(float pos, float width, float alpha)
		{
			var gridLine = new VisualElement();
			gridLine.style.position = Position.Absolute;
			gridLine.style.left = pos;
			gridLine.style.top = 0;
			gridLine.style.bottom = 0;
			gridLine.style.width = width;
			gridLine.style.backgroundColor = new StyleColor(new Color(1, 1, 1, alpha));
			gridLine.pickingMode = PickingMode.Ignore;
			_timelineCanvas.Add(gridLine);
		}

		private void CreateBar(ProjectItemData item, float topPos)
		{
			// Parse Logic using Ticks (JsonUtility friendly)
			DateTime start = item.StartDateTicks > 0 ? new DateTime(item.StartDateTicks) : new DateTime(item.CreatedAtTicks);
			// Use DueDate property
			DateTime end = item.DueDate ?? start.AddDays(1);

			// Validation
			if (end < start) end = start.AddDays(1);

			float startOffset = (float)(start - _startDateBase).TotalDays * _pixelsPerDay;
			float durationDays = (float)(end - start).TotalDays;

			if (durationDays < 0.2f) durationDays = 0.2f; // Min width visual

			float width = durationDays * _pixelsPerDay;

			TimelineItem bar = new TimelineItem(item);
			bar.style.top = topPos + 5; // +5 padding to center in 30px row (20px height)
			bar.style.left = startOffset;
			bar.style.width = width;

			// Add Manipulator
			bar.AddManipulator(new TimelineManipulator(_pixelsPerDay, _startDateBase, () => OnItemChanged(bar)));

			_timelineCanvas.Add(bar);
		}

		private void OnItemChanged(TimelineItem item)
		{
			// Convert Pixels back to Date
			double startDays = item.resolvedStyle.left / _pixelsPerDay;
			double widthDays = item.resolvedStyle.width / _pixelsPerDay;

			DateTime rawStart = _startDateBase.AddDays(startDays);
			DateTime rawEnd = rawStart.AddDays(widthDays);

			// Explicit Rounding to 5 minutes
			DateTime roundedStart = RoundTo5Minutes(rawStart);
			DateTime roundedEnd = RoundTo5Minutes(rawEnd);

			item.Data.StartDateTicks = roundedStart.Ticks;
			item.Data.DueDate = roundedEnd;

			Debug.Log($"[Timeline] {item.Data.Title} -> {roundedStart} ~ {roundedEnd}");

			KarmoToysApp.Instance.SaveData();

			// Refresh visuals if label needs update
			item.UpdateVisuals();
		}

		private DateTime RoundTo5Minutes(DateTime dt)
		{
			int minutes = dt.Minute;
			int remainder = minutes % 5;
			if (remainder >= 3) minutes += (5 - remainder);
			else minutes -= remainder;

			return new DateTime(dt.Year, dt.Month, dt.Day, dt.Hour, 0, 0).AddMinutes(minutes);
		}

		private void OnAddNewItem()
		{
			KarmoToysApp.Instance.Data.ProjectItems.Add(new ProjectItemData
			{
				Id = Guid.NewGuid().ToString(),
				Title = "New Timeline Task",
				Status = MemoStatus.Todo,
				Priority = Priority.Medium,
				StartDateTicks = DateTime.Today.Ticks,
				DueDate = DateTime.Today.AddDays(3),
				CreatedAtTicks = DateTime.UtcNow.Ticks
			});
			KarmoToysApp.Instance.SaveData();

			Refresh();
			KarmoToysApp.Toast.Show("New Task Added to Timeline 📅");
		}
	}
}

