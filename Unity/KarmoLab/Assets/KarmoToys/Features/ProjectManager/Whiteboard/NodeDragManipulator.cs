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

		public NodeDragManipulator() => activators.Add(new ManipulatorActivationFilter { button = MouseButton.LeftMouse });

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
			Debug.Log($"[NodeDrag] PointerDown on {evt.target} (Node: {target.name})");

			if (CanStartManipulation(evt))
			{
				_isActive = true;
				_isDragging = false;
				_startClickPos = evt.position;
				_startPointerPosition = evt.position;

				// Use style values for more predictable math than resolvedStyle
				float startX = target.style.left.value.value;
				float startY = target.style.top.value.value;

				if (float.IsNaN(startX)) startX = 0;
				if (float.IsNaN(startY)) startY = 0;

				_startPosition = new Vector3(startX, startY, 0);

				evt.StopPropagation();
			}
		}

		private void OnPointerMove(PointerMoveEvent evt)
		{
			if (!_isActive && !target.HasPointerCapture(evt.pointerId))
				return;

			if (_isActive && !_isDragging)
			{
				if (Vector3.Distance(evt.position, _startClickPos) > 5f)
				{
					_isDragging = true;
					target.CapturePointer(evt.pointerId);
					target.BringToFront();
					Debug.Log("[NodeDrag] Drag Started");
				}
				else return;
			}

			if (!_isDragging) return;

			Vector3 delta = evt.position - _startPointerPosition;

			// Get scale from Canvas (parent)
			float canvasScale = 1.0f;
			if (target.parent != null)
			{
				canvasScale = target.parent.style.scale.value.value.x;
			}
			if (canvasScale < 0.001f) canvasScale = 1.0f;

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
					Debug.Log("[NodeDrag] Drag Released");
				}

				evt.StopPropagation();
			}
		}
	}
}
