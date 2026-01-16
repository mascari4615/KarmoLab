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
					Application.runInBackground = true; // Stay alive even when unfocused
					InitializeTransparency();

					ViewContainer = root; // Critical: Assignment for Update loop
					InitializeInteractions();
					InitializeSettingsButton(root);
				}
				catch (System.Exception ex)
				{
					Debug.LogError($"Companion initialization failed: {ex}");
				}
			}
		}

		private Vector2 _dragOffset;
		private bool _isDragging;
		private VisualElement _dragTarget;
		private Vector2 _dragStartMousePos;
		private bool _hasDraggedSignificantly;
		private const float DragThreshold = 5f;

		// 3D Drag State
		private bool _isDragging3D;
		private Transform _dragTarget3D;
		private float _dragZDepth;
		private Vector3 _dragOffset3D;
		private IDragHandler _activeHandler3D;

		// Avatar Manipulation
		private System.Collections.Generic.List<IDragHandler> _avatarHandlers = new();
		private IDragHandler _selectedAvatar;
		private VisualElement _settingsPanel;
		private VisualElement _settingsButton;

		private void InitializeInteractions()
		{
			// 1. Find all objects that want to handle dragging
			// Note: We use GameObject.FindObjectsByType with Interface support (Unity 2021.3+)
			_avatarHandlers.Clear();
			var handlers = GameObject.FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None).OfType<IDragHandler>().ToArray();

			foreach (var h in handlers)
			{
				if (h.Dimension == InteractionDimension.ThreeD)
					_avatarHandlers.Add(h);
			}

			if (_avatarHandlers.Count > 0)
			{
				_selectedAvatar = _avatarHandlers[0];
				Debug.Log($"[Companion] Found {_avatarHandlers.Count} avatars. Selected: {_selectedAvatar.Transform.name}");
			}
			else
			{
				Debug.Log("[Companion] No interaction handlers found in scene.");
			}
		}

		private void InitializeSettingsButton(VisualElement root)
		{
			var settingsButton = new Label("⚙️")
			{
				name = "SettingsButton",
				style =
				{
					fontSize = 40,
					top = 20,
					left = 20,
					color = Color.white,
					position = Position.Absolute,
					cursor = new StyleCursor(StyleKeyword.Auto)
				}
			};

			_settingsButton = settingsButton;
			root.Add(settingsButton);
		}

		private void ToggleSettingsPanel(VisualElement root)
		{
			if (_settingsPanel != null)
			{
				root.Remove(_settingsPanel);
				_settingsPanel = null;
				return;
			}

			// Anchor position to settings button
			float panelTop = 80;
			float panelLeft = 20;

			if (_settingsButton != null)
			{
				panelTop = _settingsButton.resolvedStyle.top + _settingsButton.resolvedStyle.height + 10;
				panelLeft = _settingsButton.resolvedStyle.left;
			}

			_settingsPanel = new VisualElement
			{
				name = "SettingsPanel",
				style =
				{
					backgroundColor = new Color(0, 0, 0, 0.7f),
					paddingTop = 10, paddingBottom = 10, paddingLeft = 10, paddingRight = 10,
					borderTopLeftRadius = 10, borderTopRightRadius = 10,
					borderBottomLeftRadius = 10, borderBottomRightRadius = 10,
					position = Position.Absolute,
					top = panelTop, left = panelLeft,
					width = 250
				}
			};

			// --- Header / Title Bar ---
			var titleBar = new VisualElement { name = "SettingsHeader", style = { flexDirection = FlexDirection.Row, marginBottom = 5 } };
			var title = new Label("Avatar Settings")
			{
				name = "SettingsTitle",
				style = { color = Color.white, unityFontStyleAndWeight = FontStyle.Bold, flexGrow = 1 }
			};
			titleBar.Add(title);
			_settingsPanel.Add(titleBar);

			if (_selectedAvatar == null)
			{
				_settingsPanel.Add(new Label("No Avatar Selected") { style = { color = Color.gray } });
			}
			else
			{
				_settingsPanel.Add(new Label($"Target: {_selectedAvatar.Transform.name}") { style = { fontSize = 12, marginBottom = 10, color = Color.cyan } });

				// --- Scale Control ---
				_settingsPanel.Add(new Label("Scale") { style = { fontSize = 12, color = Color.white } });
				var scaleSlider = new Slider(0.1f, 5.0f) { value = _selectedAvatar.Transform.localScale.x };
				scaleSlider.RegisterValueChangedCallback((ChangeEvent<float> evt) =>
				{
					if (_selectedAvatar != null) _selectedAvatar.Transform.localScale = Vector3.one * evt.newValue;
				});
				_settingsPanel.Add(scaleSlider);

				// --- Rotation Control ---
				_settingsPanel.Add(new Label("Rotation (Y)") { style = { fontSize = 12, color = Color.white, marginTop = 10 } });
				var rotateSlider = new Slider(0f, 360f) { value = _selectedAvatar.Transform.localEulerAngles.y };
				rotateSlider.RegisterValueChangedCallback((ChangeEvent<float> evt) =>
				{
					if (_selectedAvatar != null)
					{
						Vector3 rot = _selectedAvatar.Transform.localEulerAngles;
						rot.y = evt.newValue;
						_selectedAvatar.Transform.localEulerAngles = rot;
					}
				});
				_settingsPanel.Add(rotateSlider);

				// Reset Button
				var resetBtn = new Button(() =>
				{
					if (_selectedAvatar != null)
					{
						_selectedAvatar.Transform.localScale = Vector3.one;
						_selectedAvatar.Transform.localRotation = Quaternion.identity;
						scaleSlider.value = 1f;
						rotateSlider.value = 0f;
					}
				})
				{ text = "Reset" };
				resetBtn.style.marginTop = 15;
				_settingsPanel.Add(resetBtn);
			}

			root.Add(_settingsPanel);
		}

		// UI Toolkit event handlers are removed in favor of unified Update polling to prevent "먹통" (unresponsiveness) 
		// and capture conflicts that the user reported. Logic is moved to the Update() method.

		private void InitializeTransparency()
		{
#if !UNITY_EDITOR
			// 1. Process Command Line Arguments for Window Size
			var args = System.Environment.GetCommandLineArgs();
			int targetW = -1;
			int targetH = -1;
			bool forceFullWorkArea = false;

			for (int i = 0; i < args.Length; i++)
			{
				if (args[i] == "-width" && i + 1 < args.Length) int.TryParse(args[i + 1], out targetW);
				if (args[i] == "-height" && i + 1 < args.Length) int.TryParse(args[i + 1], out targetH);
				if (args[i] == "-fullworkarea") forceFullWorkArea = true;
			}

			if (forceFullWorkArea || (targetW <= 0 || targetH <= 0))
			{
				var workArea = WindowTransparencyUtils.GetWorkArea();
				targetW = (int)workArea.width;
				targetH = (int)workArea.height;
			}

			// Ensure the window fills the target area regardless of previous size
			Screen.SetResolution(targetW, targetH, FullScreenMode.Windowed);

			KarmoToys.Main.KarmoToysApp.Instance.StartCoroutine(TransparencyRoutine());
#else
			Debug.Log("Transparency simulation (check logs).");
#endif
		}

		private System.Collections.IEnumerator TransparencyRoutine()
		{
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

			// 1. Enforce Always On Top periodically
			_topMostTimer += Time.deltaTime;
			if (_topMostTimer > 1.0f)
			{
				WindowTransparencyUtils.SetAlwaysOnTop(true);
				_topMostTimer = 0f;
			}

			// 2. Click-Through & Interaction Logic
			if (ViewContainer != null)
			{
				bool isHovering = false;
				VisualElement hoveredUI = TransparencyHitTest.OverlapPoint(ViewContainer);
				GameObject hovered3D = null;

				if (hoveredUI != null)
				{
					isHovering = true;
				}
				else
				{
					hovered3D = Perform3DRaycast();
					if (hovered3D != null) isHovering = true;
				}

				// --- CRITICAL: Apply Click-Through state BEFORE polling input ---
				// If we are dragging, we MUST NOT be click-through.
				bool shouldBeClickThrough = !isHovering && !_isDragging && !_isDragging3D;

				if (shouldBeClickThrough != _isClickThrough)
				{
					_isClickThrough = shouldBeClickThrough;
					WindowTransparencyUtils.SetClickThrough(_isClickThrough);
				}

				bool isMouseDown = WindowTransparencyUtils.IsLeftMouseButtonDown();

				// --- Interaction Trigger ---
				if (isHovering && isMouseDown && !_isDragging && !_isDragging3D)
				{
					if (hoveredUI != null)
					{
						// Only start drag for specific elements
						VisualElement moveTarget = null;
						if (hoveredUI.name == "SettingsButton") moveTarget = hoveredUI;

						if (moveTarget != null)
							StartUIDrag(moveTarget);
					}
					else if (hovered3D != null)
					{
						Start3DDrag(hovered3D);
					}
				}

				// --- Release Logic ---
				if (!isMouseDown)
				{
					if (_isDragging && _dragTarget != null)
					{
						// Click detection - Toggle if it was a quick click on the settings button
						if (!_hasDraggedSignificantly && _dragTarget.name == "SettingsButton")
						{
							ToggleSettingsPanel(ViewContainer);
						}
					}

					if (_isDragging3D && _activeHandler3D != null) _activeHandler3D.OnDragEnd();

					_isDragging = false;
					_dragTarget = null;
					_isDragging3D = false;
					_dragTarget3D = null;
					_activeHandler3D = null;
					_hasDraggedSignificantly = false;
				}

				// --- Drag execution ---
				if (_isDragging && _dragTarget != null)
				{
					UpdateUIDrag();
					isHovering = true;
				}
				else if (_isDragging3D && _dragTarget3D != null)
				{
					Update3DDrag();
					isHovering = true;
				}
			}
		}

		private GameObject Perform3DRaycast()
		{
			Vector2 mousePos = WindowTransparencyUtils.GetMousePosInWindow();
			Vector3 screenPos = new Vector3(mousePos.x, Screen.height - mousePos.y, 0f);
			if (Camera.main == null) return null;
			Ray ray = Camera.main.ScreenPointToRay(screenPos);

			if (Physics.Raycast(ray, out RaycastHit hit))
			{
				// Now check for any IDragHandler in parents
				if (hit.collider.GetComponentInParent<IDragHandler>() != null)
					return hit.collider.gameObject;
			}
			return null;
		}

		private void StartUIDrag(VisualElement target)
		{
			_isDragging = true;
			_dragTarget = target;

			Vector2 winMousePos = WindowTransparencyUtils.GetMousePosInWindow();
			_dragStartMousePos = winMousePos;
			_hasDraggedSignificantly = false;

			float ratioX = winMousePos.x / Screen.width;
			float ratioY = winMousePos.y / Screen.height;
			Vector2 layoutMousePos = new Vector2(ratioX * ViewContainer.layout.width, ratioY * ViewContainer.layout.height);

			// Offset relative to the move target's layout
			_dragOffset = new Vector2(layoutMousePos.x - _dragTarget.layout.x, layoutMousePos.y - _dragTarget.layout.y);
		}

		private void UpdateUIDrag()
		{
			Vector2 winMousePos = WindowTransparencyUtils.GetMousePosInWindow();

			float ratioX = winMousePos.x / Screen.width;
			float ratioY = winMousePos.y / Screen.height;
			Vector2 manualPanelPos = new Vector2(ratioX * ViewContainer.layout.width, ratioY * ViewContainer.layout.height);

			// If we haven't confirmed it's a drag yet, check distance
			if (!_hasDraggedSignificantly)
			{
				Vector2 currentMousePos = new Vector2(winMousePos.x, winMousePos.y);
				// Note: screen scale might differ, but 5-10 pixels is usually safe
				if (Vector2.Distance(_dragStartMousePos, currentMousePos) > DragThreshold)
				{
					_hasDraggedSignificantly = true;
				}
			}

			if (_hasDraggedSignificantly)
			{
				_dragTarget.style.left = manualPanelPos.x - _dragOffset.x;
				_dragTarget.style.top = manualPanelPos.y - _dragOffset.y;

				// If we are dragging the button, keep the panel attached
				if (_dragTarget == _settingsButton && _settingsPanel != null)
				{
					_settingsPanel.style.left = _dragTarget.style.left;
					_settingsPanel.style.top = _dragTarget.layout.y + _dragTarget.layout.height + 10;
				}
			}
		}

		private void Start3DDrag(GameObject target)
		{
			_isDragging3D = true;
			_activeHandler3D = target.GetComponentInParent<IDragHandler>();

			if (_activeHandler3D != null)
			{
				_dragTarget3D = _activeHandler3D.Transform;
				_activeHandler3D.OnDragStart();
			}
			else
			{
				_dragTarget3D = target.transform;
			}

			Vector2 mousePos = WindowTransparencyUtils.GetMousePosInWindow();
			Vector3 screenPos = new Vector3(mousePos.x, Screen.height - mousePos.y, 0f);

			if (Camera.main != null)
			{
				_dragZDepth = Camera.main.WorldToScreenPoint(_dragTarget3D.position).z;
				Vector3 worldMousePos = Camera.main.ScreenToWorldPoint(new Vector3(screenPos.x, screenPos.y, _dragZDepth));
				_dragOffset3D = _dragTarget3D.position - worldMousePos;
			}
		}

		private void Update3DDrag()
		{
			Vector2 mousePos = WindowTransparencyUtils.GetMousePosInWindow();
			Vector3 screenPos = new Vector3(mousePos.x, Screen.height - mousePos.y, 0f);

			if (Camera.main != null)
			{
				Vector3 worldMousePos = Camera.main.ScreenToWorldPoint(new Vector3(screenPos.x, screenPos.y, _dragZDepth));
				Vector3 newPos = worldMousePos + _dragOffset3D;
				_dragTarget3D.position = newPos;

				if (_activeHandler3D != null)
					_activeHandler3D.OnDrag(newPos);
			}
		}

		public override void OnSelect()
		{
			base.OnSelect();
		}
	}
}
