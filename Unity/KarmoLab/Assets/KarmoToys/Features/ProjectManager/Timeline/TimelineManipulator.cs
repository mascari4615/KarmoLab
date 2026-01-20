using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Features.ProjectManager.Timeline
{
	public class TimelineManipulator : MouseManipulator
	{
		private float _pixelsPerDay;
		private DateTime _startDateBase;
		private Action _onChange;

		private bool _isDragging;
		private Vector2 _startMousePos;
		private float _startLeft;
		private float _startWidth;

		private enum Mode { None, Move, ResizeLeft, ResizeRight }
		private Mode _mode = Mode.None;

		// References to handles (obtained via Name or Class or passed in)
		// Ideally TimelineItem sets names for handles so we can identify them.

		public TimelineManipulator(float pixelsPerDay, DateTime startDateBase, Action onChange)
		{
			_pixelsPerDay = pixelsPerDay;
			_startDateBase = startDateBase;
			_onChange = onChange;
			activators.Add(new ManipulatorActivationFilter { button = MouseButton.LeftMouse });
		}

		protected override void RegisterCallbacksOnTarget()
		{
			target.RegisterCallback<MouseDownEvent>(OnMouseDown);
			target.RegisterCallback<MouseMoveEvent>(OnMouseMove);
			target.RegisterCallback<MouseUpEvent>(OnMouseUp);
		}

		protected override void UnregisterCallbacksFromTarget()
		{
			target.UnregisterCallback<MouseDownEvent>(OnMouseDown);
			target.UnregisterCallback<MouseMoveEvent>(OnMouseMove);
			target.UnregisterCallback<MouseUpEvent>(OnMouseUp);
		}

		private void OnMouseDown(MouseDownEvent evt)
		{
			if (evt.target is VisualElement el)
			{
				// Identify Mode
				// TimelineItem structure: Label (child), ResizeLeft (child), ResizeRight (child)
				// The evt.target might be the handle itself if bubbling up, OR we check names.
				// It is safer to check if target or propagation path involves the handles.
				// However, since we attached this to TimelineItem (Parent), evt.target is the specific element clicked.

				// We depend on class names or specific objects.
				// Let's assume TimelineItem assigns specific user data or names.
				// Or simpler: Check if it's strictly the handle VisualElement.

				// But we don't have direct access to private handles of TimelineItem here easily unless we cast.
				// Let's rely on TimelineItem exposing public getters or checking identifying properties.

				// Hacky check: 
				// Handles are 5px wide sidebars.

				_mode = Mode.Move; // Default

				// Check if we clicked resize handles
				// Note: UIElements events bubble. evt.target is the leaf.
				if (evt.target is VisualElement leaf)
				{
					// To be robust, TimelineItem handles should have a class or name.
					// Let's check TimelineItem implementation or assume.
					// Since I wrote TimelineItem, I know handles have no class/name yet, just added to root.
					// I should update TimelineItem to add class names to handles.

					// For now, let's assume if it is NOT the TimelineItem itself (target), it might be a handle?
					// But Label is also a child.

					// I will go back and update TimelineItem to add names to handles first!
					// Then continue this implementation.
					// But I cannot break flow. I will write this file assuming handles are named "HandleLeft", "HandleRight".

					if (leaf.name == "HandleLeft") _mode = Mode.ResizeLeft;
					else if (leaf.name == "HandleRight") _mode = Mode.ResizeRight;
				}

				_isDragging = true;
				_startMousePos = evt.mousePosition; // Relative to PARENT? No, local to target (Item).
													// Wait, if we move the Item, local position changes? 
													// We should use evt.mousePosition (screen/window) or root space.
				_startLeft = target.resolvedStyle.left;
				_startWidth = target.resolvedStyle.width;

				target.CaptureMouse();
				evt.StopPropagation();
			}
		}

		private void OnMouseMove(MouseMoveEvent evt)
		{
			if (!_isDragging || !target.HasMouseCapture()) return;

			float deltaX = evt.mousePosition.x - _startMousePos.x;

			// Snap Logic (5 minutes)
			float snapUnit = _pixelsPerDay / 288f; // 1440 mins / 5 = 288 steps

			float currentLeft = _startLeft;
			float currentWidth = _startWidth;

			if (_mode == Mode.Move)
			{
				float rawNewLeft = _startLeft + deltaX;
				currentLeft = Mathf.Round(rawNewLeft / snapUnit) * snapUnit;
				target.style.left = currentLeft;
			}
			else if (_mode == Mode.ResizeRight)
			{
				float rawNewWidth = _startWidth + deltaX;
				currentWidth = Mathf.Round(rawNewWidth / snapUnit) * snapUnit;
				if (currentWidth < snapUnit) currentWidth = snapUnit;
				target.style.width = currentWidth;
			}
			else if (_mode == Mode.ResizeLeft)
			{
				float rawNewLeft = _startLeft + deltaX;
				float snappedNewLeft = Mathf.Round(rawNewLeft / snapUnit) * snapUnit;

				float newWidth = (_startLeft + _startWidth) - snappedNewLeft;

				if (newWidth >= snapUnit)
				{
					currentLeft = snappedNewLeft;
					currentWidth = newWidth;
					target.style.left = currentLeft;
					target.style.width = currentWidth;
				}
			}

			// Visual Feedback: Show Time Range
			if (target is TimelineItem item)
			{
				TimeStamp startStamp = PixelToTime(currentLeft);
				TimeStamp endStamp = PixelToTime(currentLeft + currentWidth);
				item.SetTempLabel($"{startStamp} ~ {endStamp}");
			}
		}

		private TimeStamp PixelToTime(float pixels)
		{
			double totalDays = pixels / _pixelsPerDay;
			DateTime time = _startDateBase.AddDays(totalDays);
			// Round explicitly to nearest 5 mins just in case
			int minutes = time.Minute;
			int remainder = minutes % 5;
			if (remainder >= 3) minutes += (5 - remainder);
			else minutes -= remainder;

			DateTime cleanTime = new DateTime(time.Year, time.Month, time.Day, time.Hour, 0, 0).AddMinutes(minutes);
			return new TimeStamp(cleanTime);
		}

		private struct TimeStamp
		{
			public DateTime Time;
			public TimeStamp(DateTime t) { Time = t; }
			public override string ToString() => Time.ToString("M/d HH:mm");
		}

		private void OnMouseUp(MouseUpEvent evt)
		{
			if (!_isDragging) return;

			_isDragging = false;
			target.ReleaseMouse();
			evt.StopPropagation();

			if (target is TimelineItem item)
			{
				item.ResetLabel();
			}

			_onChange?.Invoke();
		}
	}
}
