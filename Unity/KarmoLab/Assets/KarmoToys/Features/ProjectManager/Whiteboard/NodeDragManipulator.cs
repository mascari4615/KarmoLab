using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Features.ProjectManager.Whiteboard
{
	public class NodeDragManipulator : PointerManipulator
	{
		private Vector3 _startPosition;
		private Vector3 _startPointerPosition;
		private bool _isDragging;
		private bool _isActive;
		private Vector3 _startClickPos;

		public NodeDragManipulator()
		{
			activators.Add(new ManipulatorActivationFilter { button = MouseButton.LeftMouse });
		}

		protected override void RegisterCallbacksOnTarget()
		{
			target.RegisterCallback<PointerDownEvent>(OnPointerDown);
			target.RegisterCallback<PointerMoveEvent>(OnPointerMove);
			target.RegisterCallback<PointerUpEvent>(OnPointerUp);
		}

		protected override void UnregisterCallbacksFromTarget()
		{
			target.UnregisterCallback<PointerDownEvent>(OnPointerDown);
			target.UnregisterCallback<PointerMoveEvent>(OnPointerMove);
			target.UnregisterCallback<PointerUpEvent>(OnPointerUp);
		}

		private void OnPointerDown(PointerDownEvent evt)
		{
			Debug.Log($"[DragManipulator] Down: {evt.target} (Capture? {target.HasPointerCapture(evt.pointerId)})");
			if (CanStartManipulation(evt))
			{
				_isActive = true;
				_isDragging = false;
				_startClickPos = evt.position;
				_startPointerPosition = evt.position;

				// Use resolvedStyle for current layout position instead of transform.position (Obsolete)
				_startPosition = new Vector3(target.resolvedStyle.left, target.resolvedStyle.top, 0);

				// Do NOT capture yet. Wait for move.
				// target.CapturePointer(evt.pointerId); 
				evt.StopPropagation();
			}
		}

		private void OnPointerMove(PointerMoveEvent evt)
		{
			if (!_isActive && !target.HasPointerCapture(evt.pointerId))
				return;

			if (_isActive && !_isDragging)
			{
				// Check Threshold
				if (Vector3.Distance(evt.position, _startClickPos) > 5f)
				{
					// Start Drag
					_isDragging = true;
					target.CapturePointer(evt.pointerId);
					target.BringToFront();
				}
				else
				{
					return; // Ignore small moves
				}
			}

			if (!_isDragging) return;

			Vector3 delta = (Vector3)evt.position - _startPointerPosition;

			// CRITICAL: We are dragging an element INSIDE a scaled container (Canvas).
			// The mouse delta is in Screen/Panel space (scaled by UI scale, but NOT by Canvas scale).
			// To move the node 1:1 with the mouse, we must divide the delta by the Canvas Scale.

			// We can get the Canvas Scale from the parent's style (set by PanZoomManipulator).
			// transform.scale is obsolete.
			float canvasScale = 1.0f;
			if (target.parent != null)
			{
				canvasScale = target.parent.style.scale.value.value.x;
			}

			if (canvasScale < 0.0001f) canvasScale = 1.0f; // Safety

			Vector3 localDelta = delta / canvasScale;

			Vector3 newPos = _startPosition + localDelta;

			// Snap to Grid (25px)
			float snap = 25f;
			newPos.x = Mathf.Round(newPos.x / snap) * snap;
			newPos.y = Mathf.Round(newPos.y / snap) * snap;

			if (target is WhiteboardNode node)
			{
				node.UpdatePosition(newPos);
			}
			else
			{
				target.style.left = newPos.x;
				target.style.top = newPos.y;
			}

			evt.StopPropagation();
		}

		private void OnPointerUp(PointerUpEvent evt)
		{
			if (_isActive || _isDragging)
			{
				_isActive = false;
				_isDragging = false;

				if (target.HasPointerCapture(evt.pointerId))
				{
					target.ReleasePointer(evt.pointerId);
				}

				evt.StopPropagation();
			}
		}
	}
}
