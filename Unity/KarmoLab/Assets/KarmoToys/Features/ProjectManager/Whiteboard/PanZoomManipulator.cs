using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Features.ProjectManager.Whiteboard
{
	public class PanZoomManipulator : PointerManipulator
	{
		private Vector3 _startPos;
		private Vector3 _startPanPos;
		private bool _isPanning;

		private const float MinScale = 0.01f;
		private const float MaxScale = 10.0f;
		private const float ZoomRatio = 1.05f;

		// Smoothness Settings
		private const float LerpSpeed = 0.2f; // Higher = Snappier, Lower = Smoother/Heavier
		private const float Epsilon = 0.001f;

		public VisualElement ContentTarget { get; set; }
		public GridBackground Grid { get; set; }

		private bool _isInitialized = false;

		// Target State (Where we want to be)
		private Vector3 _targetPosition;
		private float _targetScale = 1.0f;

		// Current State (Where we are)
		private Vector3 _currentPosition = Vector3.zero;
		private float _currentScale = 1.0f;

		private IVisualElementScheduledItem _animationLoop;

		public PanZoomManipulator(VisualElement contentTarget = null)
		{
			ContentTarget = contentTarget;
			activators.Add(new ManipulatorActivationFilter { button = MouseButton.MiddleMouse });
			activators.Add(new ManipulatorActivationFilter { button = MouseButton.LeftMouse, modifiers = EventModifiers.Alt });
			activators.Add(new ManipulatorActivationFilter { button = MouseButton.LeftMouse, modifiers = EventModifiers.Shift });
		}

		protected override void RegisterCallbacksOnTarget()
		{
			target.RegisterCallback<AttachToPanelEvent>(OnAttach);
			target.RegisterCallback<PointerDownEvent>(OnPointerDown);
			target.RegisterCallback<PointerMoveEvent>(OnPointerMove);
			target.RegisterCallback<PointerUpEvent>(OnPointerUp);
			target.RegisterCallback<WheelEvent>(OnWheel);
			target.RegisterCallback<GeometryChangedEvent>(OnGeometryChanged);

			// Start Animation Loop (60 FPS approx)
			_animationLoop = target.schedule.Execute(OnUpdate).Every(16);

			EnsureGridReference();
		}

		protected override void UnregisterCallbacksFromTarget()
		{
			target.UnregisterCallback<AttachToPanelEvent>(OnAttach);
			target.UnregisterCallback<PointerDownEvent>(OnPointerDown);
			target.UnregisterCallback<PointerMoveEvent>(OnPointerMove);
			target.UnregisterCallback<PointerUpEvent>(OnPointerUp);
			target.UnregisterCallback<WheelEvent>(OnWheel);
			target.UnregisterCallback<GeometryChangedEvent>(OnGeometryChanged);

			_animationLoop?.Pause();
		}

		private void OnUpdate()
		{
			// Lerp towards target
			bool distinctPos = Vector3.Distance(_currentPosition, _targetPosition) > Epsilon;
			bool distinctScale = Mathf.Abs(_currentScale - _targetScale) > Epsilon;

			if (distinctPos || distinctScale)
			{
				_currentPosition = Vector3.Lerp(_currentPosition, _targetPosition, LerpSpeed);
				_currentScale = Mathf.Lerp(_currentScale, _targetScale, LerpSpeed);
				ApplyTransform();
			}
		}

		private void EnsureGridReference()
		{
			if (Grid == null && target != null)
			{
				Grid = target.Q<GridBackground>();
				if (Grid != null)
				{
					Debug.Log($"[Whiteboard] GridBackground Connected to Manipulator! Init Pos: {_currentPosition}");
					Grid.UpdateView(_currentPosition, _currentScale);
				}
			}
		}

		private void OnAttach(AttachToPanelEvent evt)
		{
			EnsureGridReference();

			if (target.resolvedStyle.width > 0 && !_isInitialized)
			{
				SetInitialState();
			}
		}

		private void OnGeometryChanged(GeometryChangedEvent evt)
		{
			if (!_isInitialized && evt.newRect.width > 0 && evt.newRect.height > 0)
			{
				SetInitialState();
			}
		}

		private void SetInitialState()
		{
			// Center calculation (same as before)
			float viewportW = target.resolvedStyle.width;
			float viewportH = target.resolvedStyle.height;

			if (float.IsNaN(viewportW) || viewportW == 0) viewportW = Screen.width;
			if (float.IsNaN(viewportH) || viewportH == 0) viewportH = Screen.height;

			float x = (viewportW * 0.5f) - (CanvasSize * 0.5f);
			float y = (viewportH * 0.5f) - (CanvasSize * 0.5f);

			// Set both Target and Current to initial
			_targetPosition = new Vector3(x, y, 0f);
			_currentPosition = _targetPosition;
			_targetScale = 1.0f;
			_currentScale = 1.0f;

			ApplyTransform();
			_isInitialized = true;
		}

		private void OnPointerDown(PointerDownEvent evt)
		{
			if (CanStartManipulation(evt))
			{
				_isPanning = true;
				_startPos = evt.position;
				_startPanPos = _targetPosition; // Start from TARGET to keep input 1:1 consistent
				target.CapturePointer(evt.pointerId);
				evt.StopPropagation();
			}
		}

		private void OnPointerMove(PointerMoveEvent evt)
		{
			if (!_isPanning || !target.HasPointerCapture(evt.pointerId))
				return;

			Vector3 delta = (Vector3)evt.position - _startPos;

			// No Damping in Input (1:1 Control)
			// But Output is Damped (Lerp)

			_targetPosition = _startPanPos + (delta / _targetScale);

			// Live Clamping on Target
			ClampTargetPosition();

			evt.StopPropagation();
		}

		private void OnPointerUp(PointerUpEvent evt)
		{
			if (_isPanning && target.HasPointerCapture(evt.pointerId))
			{
				_isPanning = false;
				target.ReleasePointer(evt.pointerId);
				evt.StopPropagation();
			}
		}

		private void OnWheel(WheelEvent evt)
		{
			float zoomFactor = evt.delta.y < 0 ? ZoomRatio : (1f / ZoomRatio);
			float newScale = Mathf.Clamp(_targetScale * zoomFactor, MinScale, MaxScale);

			Vector3 mousePos = evt.localMousePosition;
			Vector3 oldPos = _targetPosition;
			float effectiveRatio = newScale / _targetScale;

			Vector3 newPos = mousePos - (mousePos - oldPos) * effectiveRatio;

			_targetScale = newScale;
			_targetPosition = newPos;

			ClampTargetPosition();
			evt.StopPropagation();
		}

		private const float CanvasSize = 100000f;

		private void ClampTargetPosition()
		{
			if (target.panel == null) return;

			float viewportW = target.resolvedStyle.width;
			float viewportH = target.resolvedStyle.height;
			if (float.IsNaN(viewportW) || viewportW == 0) viewportW = Screen.width;
			if (float.IsNaN(viewportH) || viewportH == 0) viewportH = Screen.height;

			float overscrollX = viewportW * 0.5f;
			float overscrollY = viewportH * 0.5f;

			float maxX = overscrollX;
			float maxY = overscrollY;

			float minX = (viewportW * 0.5f) - (CanvasSize * _targetScale);
			float minY = (viewportH * 0.5f) - (CanvasSize * _targetScale);

			_targetPosition.x = Mathf.Clamp(_targetPosition.x, minX, maxX);
			_targetPosition.y = Mathf.Clamp(_targetPosition.y, minY, maxY);
		}

		private void ApplyTransform()
		{
			// Sync logic in OnUpdate handles the calls
			var transformTarget = ContentTarget ?? target;
			if (transformTarget != null)
			{
				transformTarget.style.translate = new Translate(_currentPosition.x, _currentPosition.y, 0);
				transformTarget.style.scale = new Scale(new Vector3(_currentScale, _currentScale, 1));
			}

			// Dynamic Grid Update
			EnsureGridReference();
			if (Grid != null)
			{
				Grid.UpdateView(_currentPosition, _currentScale);
			}
		}
	}
}
