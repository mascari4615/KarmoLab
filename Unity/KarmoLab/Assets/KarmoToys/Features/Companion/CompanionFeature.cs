using System;
using System.Linq;
using KarmoToys.Core;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Features.Companion
{
	public class CompanionFeature : FeatureBase
	{
		public override string FeatureName => "Companion";
		public override string TabButtonName => "Companion";

		private bool _isCompanionMode;

		public override void Initialize(VisualElement root)
		{
			base.Initialize(root);

			// Check command line args
			string[] args = Environment.GetCommandLineArgs();
			_isCompanionMode = args.Contains("-mode") && args.Contains("companion");

			if (_isCompanionMode)
			{
				try
				{
					Debug.Log("Companion Mode Initialized!");
					InitializeTransparency();

					ViewContainer = root; // Critical: Assignment for Update loop
					CreateCharacterPlaceholder(root);
				}
				catch (System.Exception ex)
				{
					Debug.LogError($"Companion initialization failed: {ex}");
				}
			}
		}

		private Vector2 _dragOffset;
		private bool _isDragging;

		private void CreateCharacterPlaceholder(VisualElement root)
		{
			// Simple placeholder for now
			var character = new Label("🐱")
			{
				name = "CompanionCharacter",
				style =
				{
					fontSize = 100,
					top = 100,
					left = 100,
					color = Color.white,
					position = Position.Absolute
				}
			};

			// Register Drag Events
			character.RegisterCallback<PointerDownEvent>(OnPointerDown);
			character.RegisterCallback<PointerMoveEvent>(OnPointerMove);
			character.RegisterCallback<PointerUpEvent>(OnPointerUp);
			character.RegisterCallback<PointerCaptureOutEvent>(OnPointerUp); // Release if capture lost

			root.Add(character);
		}

		private void OnPointerDown(PointerDownEvent evt)
		{
			var target = evt.target as VisualElement;
			if (target == null) return;

			_isDragging = true;
			_dragOffset = evt.localPosition;
			target.CapturePointer(evt.pointerId);
			evt.StopPropagation();
		}

		private void OnPointerMove(PointerMoveEvent evt)
		{
			if (!_isDragging || !evt.currentTarget.HasPointerCapture(evt.pointerId)) return;

			var target = evt.currentTarget as VisualElement;

			// Calculate new position
			// Using parent coordinates (ViewContainer is root)
			// evt.position is in panel coordinates usually if not captured?
			// When captured, events are sent to target.
			// localPosition is relative to target.
			// If we drag, we want to maintain the offset from the top-left of the target.

			// Strategy:
			// The mouse has moved. calculating the delta in parent space is safest.
			// But simpler:
			// Current Local Mouse Pos = evt.localPosition
			// Delta = evt.localPosition - _dragOffset
			// This delta is how much the mouse moved *relative to where it should be on the element*.
			// Since we want the element to move WITH the mouse, we just add this delta to the element's position.

			// Note: style.left/top returns a Length.
			float currentLeft = target.layout.x; // Use layout for accurate current pixel position
			float currentTop = target.layout.y;

			// However, layout updates are deferred. Using style values might be better if we are the only ones moving it.
			// But initial style might be null/auto.
			// Let's use computed resolved style logic or just accumulate.

			// Better logic for dragging in UI Toolkit:
			// root.WorldToLocal(evt.position) gives mouse pos in root space.
			// This is cleaner than relative local logic.

			// Actually, let's try the simple local delta approach first, it often works well for simple drags.
			// Delta = (Current Mouse in Local) - (Start Mouse in Local)
			// Wait, if I move the element, the local mouse position changes?
			// If I move the element +10px, and the mouse moved +10px, the local position (mouse relative to element) is SAME.
			// So delta would be 0.
			// So using local position diff is irrelevant if we move the element instantly.
			// WE MUST USE PARENT COORDINATES.

			Vector2 mousePosInParent = target.parent.WorldToLocal(evt.position);
			// Wait, evt.position is Screen space or Panel space? 
			// Documentation: "The position of the pointer in the panel's coordinate system."

			// If target.parent is the root, WorldToLocal might equate to PanelToLocal.
			// Let's assume evt.position is good for root.

			// Let's use a simpler heuristic for now:
			// We need the mouse position in the PARENT's coordinate system.
			Vector2 parentPos = target.parent.WorldToLocal(evt.position);

			// We need to know where we grabbed the object relative to its anchor (top-left).
			// OnDown: _dragOffset = evt.localPosition; (Distance from Top-Left of element to Mouse)

			// OnMove: NewTopLeft = MousePosInParent - _dragOffset
			target.style.left = parentPos.x - _dragOffset.x;
			target.style.top = parentPos.y - _dragOffset.y;
		}

		private void OnPointerUp(PointerUpEvent evt)
		{
			if (!_isDragging) return;

			var target = evt.target as VisualElement;
			if (target != null && target.HasPointerCapture(evt.pointerId))
			{
				target.ReleasePointer(evt.pointerId);
			}

			_isDragging = false;
		}

		private void OnPointerUp(PointerCaptureOutEvent evt)
		{
			_isDragging = false;
		}

		private void InitializeTransparency()
		{
#if !UNITY_EDITOR
			// Start a coroutine to ensure transparency is applied after window initialization
			KarmoToys.Main.KarmoToysApp.Instance.StartCoroutine(TransparencyRoutine());
#else
			Debug.Log("Transparency simulation (check logs).");
#endif
		}

		private System.Collections.IEnumerator TransparencyRoutine()
		{
			// Try multiple times to ensure it sticks during initialization
			for (int i = 0; i < 5; i++)
			{
				WindowTransparencyUtils.EnableTransparency();
				WindowTransparencyUtils.SetAlwaysOnTop(true);
				yield return new WaitForSeconds(0.5f);
			}
		}

		private bool _isClickThrough = false;
		private float _topMostTimer = 0f;

		private void Update()
		{
			if (!_isCompanionMode) return;

			// 1. Enforce Always On Top periodically (every 1 sec) to prevent losing it on focus loss
			_topMostTimer += Time.deltaTime;
			if (_topMostTimer > 1.0f)
			{
				WindowTransparencyUtils.SetAlwaysOnTop(true);
				_topMostTimer = 0f;
			}

			// 2. Click-Through Logic (Robust Overlap Check)
			if (ViewContainer != null)
			{
				bool isHovering = false;
				VisualElement hoveredElement = TransparencyHitTest.OverlapPoint(ViewContainer);

				if (hoveredElement != null)
				{
					isHovering = true;
				}

				// C. Manual Interaction Logic (Bypass Unity Event System)
				// We use Win32 GetAsyncKeyState because Unity's Input.GetMouseButtonDown
				// might fail on the very first frame the window regains focus.
				bool isMouseDown = WindowTransparencyUtils.IsLeftMouseButtonDown();

				if (isHovering && isMouseDown && !_isDragging)
				{
					_isDragging = true;
					_dragTarget = hoveredElement;

					// Calculate Offset
					// Need robust math pos again for offset calc
					// (Code duplication minimized slightly, but we need the exact pos for offset)
					Vector2 winPos = WindowTransparencyUtils.GetMousePosInWindow();
					float ratioX = winPos.x / Screen.width;
					float ratioY = winPos.y / Screen.height;
					Vector2 manualPanelPos = new Vector2(ratioX * ViewContainer.layout.width, ratioY * ViewContainer.layout.height);

					if (_dragTarget != null)
					{
						_dragOffset = new Vector2(manualPanelPos.x - _dragTarget.layout.x, manualPanelPos.y - _dragTarget.layout.y);
					}
				}

				if (_isDragging && !isMouseDown)
				{
					_isDragging = false;
					_dragTarget = null;
				}

				if (_isDragging && _dragTarget != null)
				{
					// Update Position
					Vector2 winPos = WindowTransparencyUtils.GetMousePosInWindow();
					float ratioX = winPos.x / Screen.width;
					float ratioY = winPos.y / Screen.height;
					Vector2 manualPanelPos = new Vector2(ratioX * ViewContainer.layout.width, ratioY * ViewContainer.layout.height);

					_dragTarget.style.left = manualPanelPos.x - _dragOffset.x;
					_dragTarget.style.top = manualPanelPos.y - _dragOffset.y;

					isHovering = true;
				}

				if (isHovering != !_isClickThrough)
				{
					_isClickThrough = !isHovering;
					WindowTransparencyUtils.SetClickThrough(_isClickThrough);
				}
			}
		}

		private VisualElement _dragTarget;

		public override void OnSelect()
		{
			base.OnSelect();
			// In full app mode, this might just show a placeholder or control panel
		}
	}
}
