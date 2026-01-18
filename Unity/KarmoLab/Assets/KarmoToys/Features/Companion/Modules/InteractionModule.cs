using System;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Features.Companion;

namespace KarmoToys.Features.Companion.Modules
{
	public class InteractionModule : ICompanionModule
	{
		private CompanionContext _context;
		
		// Drag State
		private Vector2 _dragOffset;
		private VisualElement _dragTarget;
		private Vector2 _dragStartMousePos;
		private bool _hasDraggedSignificantly;
		private const float DragThreshold = 5f;

		// 3D Drag State
		private Transform _dragTarget3D;
		private float _dragZDepth;
		private Vector3 _dragOffset3D;
		private IDragHandler _activeHandler3D;

		// Settings UI
		private VisualElement _settingsPanel;
		private VisualElement _settingsButton;
		private bool _isClickThrough = false;
		
		// Reference to ChatModule (injected or found)
		private ChatModule _chatModule;

		public void Initialize(CompanionContext context)
		{
			_context = context;
			
			// Init Settings UI
			InitializeSettingsButton();
			
			// Find Avatar (Moved from Feature)
			InitializeAvatar();
		}
		
		public void SetChatModule(ChatModule chatParams)
		{
			_chatModule = chatParams;
		}

		private void InitializeSettingsButton()
		{
			if (_context.RootUI == null) return;
			
			Label settingsButton = new Label("⚙️")
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
			_context.RootUI.Add(settingsButton);
		}

		private void InitializeAvatar()
		{
			// Find all objects that want to handle dragging
			var handlers = GameObject.FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None).OfType<IDragHandler>().ToArray();
			List<IDragHandler> avatarHandlers = new();

			foreach (var h in handlers)
			{
				if (h.Dimension == InteractionDimension.ThreeD)
					avatarHandlers.Add(h);
			}

			if (avatarHandlers.Count > 0)
			{
				_context.SelectedAvatar = avatarHandlers[0];
				Debug.Log($"[InteractionModule] Found {avatarHandlers.Count} avatars. Selected: {_context.SelectedAvatar.Transform.name}");
			}
			else
			{
				Debug.Log("[InteractionModule] No interaction handlers found in scene.");
			}
		}

		public void Update()
		{
			if (_context.ViewContainer == null) return;
			
			// Click-Through & Interaction Logic
			bool isHovering = false;
			VisualElement hoveredUI = TransparencyHitTest.OverlapPoint(_context.ViewContainer);
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
			bool shouldBeClickThrough = !isHovering && !_context.IsDragging && !_context.IsDragging3D;

			if (shouldBeClickThrough != _isClickThrough)
			{
				_isClickThrough = shouldBeClickThrough;
				WindowTransparencyUtils.SetClickThrough(_isClickThrough);
			}

			bool isMouseDown = WindowTransparencyUtils.IsLeftMouseButtonDown();

			// --- Interaction Trigger ---
			if (isHovering && isMouseDown && !_context.IsDragging && !_context.IsDragging3D)
			{
				if (hoveredUI != null)
				{
					VisualElement moveTarget = null;
					if (hoveredUI.name == "SettingsButton") moveTarget = hoveredUI;

					if (moveTarget != null)
						StartUIDrag(moveTarget);
				}
				else if (hovered3D != null)
				{
					Start3DDrag(hovered3D);
					if (_chatModule != null) 
						_chatModule.ShowRandomChat(_context.Settings.CompanionData?.DragStartReactions);
				}
			}

			// --- Release Logic ---
			if (!isMouseDown)
			{
				if (_context.IsDragging && _dragTarget != null)
				{
					if (!_hasDraggedSignificantly)
					{
						if (_dragTarget.name == "SettingsButton")
						{
							ToggleSettingsPanel(_context.RootUI);
						}
					}
				}

				if (_context.IsDragging3D && !_hasDraggedSignificantly && _activeHandler3D != null)
				{
					if (_chatModule != null) 
						_chatModule.ShowRandomChat(_context.Settings.CompanionData?.ClickReactions);
				}
				else if (_context.IsDragging3D && _hasDraggedSignificantly)
				{
					if (_chatModule != null) 
						_chatModule.ShowRandomChat(_context.Settings.CompanionData?.DragEndReactions);
				}

				if (_context.IsDragging3D && _activeHandler3D != null) _activeHandler3D.OnDragEnd();

				_context.IsDragging = false;
				_dragTarget = null;
				_context.IsDragging3D = false;
				_dragTarget3D = null;
				_activeHandler3D = null;
				_hasDraggedSignificantly = false;
			}

			// --- Drag execution ---
			if (_context.IsDragging && _dragTarget != null)
			{
				UpdateUIDrag();
			}
			else if (_context.IsDragging3D && _dragTarget3D != null)
			{
				Update3DDrag();
			}
		}

		public void OnDestroy()
		{
			// Cleanup UI
		}
		
		// --- Helpers (Raycast, Drag Logic, SettingsPanel) ---

		private GameObject Perform3DRaycast()
		{
			Vector2 mousePos = WindowTransparencyUtils.GetMousePosInWindow();
			Vector3 screenPos = new Vector3(mousePos.x, Screen.height - mousePos.y, 0f);
			if (Camera.main == null) return null;
			Ray ray = Camera.main.ScreenPointToRay(screenPos);

			if (Physics.Raycast(ray, out RaycastHit hit))
			{
				if (hit.collider.GetComponentInParent<IDragHandler>() != null)
					return hit.collider.gameObject;
			}
			return null;
		}

		private void StartUIDrag(VisualElement target)
		{
			_context.IsDragging = true;
			_dragTarget = target;

			Vector2 winMousePos = WindowTransparencyUtils.GetMousePosInWindow();
			_dragStartMousePos = winMousePos;
			_hasDraggedSignificantly = false;

			float ratioX = winMousePos.x / Screen.width;
			float ratioY = winMousePos.y / Screen.height;
			Vector2 layoutMousePos = new Vector2(ratioX * _context.ViewContainer.layout.width, ratioY * _context.ViewContainer.layout.height);

			_dragOffset = new Vector2(layoutMousePos.x - _dragTarget.layout.x, layoutMousePos.y - _dragTarget.layout.y);
		}

		private void UpdateUIDrag()
		{
			Vector2 winMousePos = WindowTransparencyUtils.GetMousePosInWindow();
			float ratioX = winMousePos.x / Screen.width;
			float ratioY = winMousePos.y / Screen.height;
			Vector2 manualPanelPos = new Vector2(ratioX * _context.ViewContainer.layout.width, ratioY * _context.ViewContainer.layout.height);

			if (!_hasDraggedSignificantly)
			{
				Vector2 currentMousePos = new Vector2(winMousePos.x, winMousePos.y);
				if (Vector2.Distance(_dragStartMousePos, currentMousePos) > DragThreshold)
				{
					_hasDraggedSignificantly = true;
				}
			}

			if (_hasDraggedSignificantly)
			{
				_dragTarget.style.left = manualPanelPos.x - _dragOffset.x;
				_dragTarget.style.top = manualPanelPos.y - _dragOffset.y;

				if (_dragTarget == _settingsButton && _settingsPanel != null)
				{
					_settingsPanel.style.left = _dragTarget.style.left;
					_settingsPanel.style.top = _dragTarget.layout.y + _dragTarget.layout.height + 10;
				}
			}
		}

		private void Start3DDrag(GameObject target)
		{
			_context.IsDragging3D = true;
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
		
		private void ToggleSettingsPanel(VisualElement root)
		{
			if (_settingsPanel != null)
			{
				root.Remove(_settingsPanel);
				_settingsPanel = null;
				return;
			}

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

			// Header
			VisualElement titleBar = new VisualElement { name = "SettingsHeader", style = { flexDirection = FlexDirection.Row, marginBottom = 5 } };
			Label title = new Label("Avatar Settings")
			{
				name = "SettingsTitle",
				style = { color = Color.white, unityFontStyleAndWeight = FontStyle.Bold, flexGrow = 1 }
			};
			titleBar.Add(title);
			_settingsPanel.Add(titleBar);

			if (_context.SelectedAvatar == null)
			{
				_settingsPanel.Add(new Label("No Avatar Selected") { style = { color = Color.gray } });
			}
			else
			{
				_settingsPanel.Add(new Label($"Target: {_context.SelectedAvatar.Transform.name}") { style = { fontSize = 12, marginBottom = 10, color = Color.cyan } });

				// Scale
				_settingsPanel.Add(new Label("Scale") { style = { fontSize = 12, color = Color.white } });
				Slider scaleSlider = new Slider(0.1f, 5.0f) { value = _context.SelectedAvatar.Transform.localScale.x };
				scaleSlider.RegisterValueChangedCallback((ChangeEvent<float> evt) =>
				{
					if (_context.SelectedAvatar != null) _context.SelectedAvatar.Transform.localScale = Vector3.one * evt.newValue;
				});
				_settingsPanel.Add(scaleSlider);

				// Rotation
				_settingsPanel.Add(new Label("Rotation (Y)") { style = { fontSize = 12, color = Color.white, marginTop = 10 } });
				Slider rotateSlider = new Slider(0f, 360f) { value = _context.SelectedAvatar.Transform.localEulerAngles.y };
				rotateSlider.RegisterValueChangedCallback((ChangeEvent<float> evt) =>
				{
					if (_context.SelectedAvatar != null)
					{
						Vector3 rot = _context.SelectedAvatar.Transform.localEulerAngles;
						rot.y = evt.newValue;
						_context.SelectedAvatar.Transform.localEulerAngles = rot;
					}
				});
				_settingsPanel.Add(rotateSlider);

				// Reset
				Button resetBtn = new Button(() =>
				{
					if (_context.SelectedAvatar != null)
					{
						_context.SelectedAvatar.Transform.localScale = Vector3.one;
						_context.SelectedAvatar.Transform.localRotation = Quaternion.identity;
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
	}
}
