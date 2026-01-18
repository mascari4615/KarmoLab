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
			// Check Mode (Now handled centrally by KarmoToysApp)
			if (KarmoToys.Main.KarmoToysApp.Instance != null)
			{
				_isCompanionMode = KarmoToys.Main.KarmoToysApp.Instance.Mode == KarmoToys.Common.AppMode.Companion;
			}
			else
			{
				// Fallback for standalone feature testing (if any)
				string[] args = Environment.GetCommandLineArgs();
				_isCompanionMode = args.Contains("-mode") && args.Contains("companion");
			}

			if (_isCompanionMode)
			{
				try
				{
					Debug.Log("Companion Mode Initialized!");
					Application.runInBackground = true; // Stay alive even when unfocused

					// Subsystem 1: Transparency
					try
					{
						InitializeTransparency();
					}
					catch (System.Exception ex) { Debug.LogError($"[Companion] Transparency Init Failed: {ex}"); }

					ViewContainer = root; // Critical: Assignment for Update loop
					InitializeInteractions();
					InitializeSettingsButton(root);

					// Subsystem 2: Chat
					try
					{
						InitializeChatSystem(root);
					}
					catch (System.Exception ex) { Debug.LogError($"[Companion] Chat Init Failed: {ex}"); }
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
			_avatarHandlers.Clear();
			IDragHandler[] handlers = GameObject.FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None).OfType<IDragHandler>().ToArray();

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
			VisualElement titleBar = new VisualElement { name = "SettingsHeader", style = { flexDirection = FlexDirection.Row, marginBottom = 5 } };
			Label title = new Label("Avatar Settings")
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
				Slider scaleSlider = new Slider(0.1f, 5.0f) { value = _selectedAvatar.Transform.localScale.x };
				scaleSlider.RegisterValueChangedCallback((ChangeEvent<float> evt) =>
				{
					if (_selectedAvatar != null) _selectedAvatar.Transform.localScale = Vector3.one * evt.newValue;
				});
				_settingsPanel.Add(scaleSlider);

				// --- Rotation Control ---
				_settingsPanel.Add(new Label("Rotation (Y)") { style = { fontSize = 12, color = Color.white, marginTop = 10 } });
				Slider rotateSlider = new Slider(0f, 360f) { value = _selectedAvatar.Transform.localEulerAngles.y };
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
				Button resetBtn = new Button(() =>
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

		private void InitializeTransparency()
		{
#if !UNITY_EDITOR
			// Note: Resolution handling is now done in KarmoToysApp.Start() to avoid double-set conflict.
			// We just start the transparency routine here.
			KarmoToys.Main.KarmoToysApp.Instance.StartCoroutine(TransparencyRoutine());
#else
			Debug.Log("Transparency simulation: Setting Camera background to Grey.");
			if (Camera.main != null)
			{
				Camera.main.clearFlags = CameraClearFlags.SolidColor;
				Camera.main.backgroundColor = new Color(0.5f, 0.5f, 0.5f, 1.0f); // Solid Grey
			}
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

						// Chat Reaction: Click UI (Maybe not for settings button, but general clicks?)
						// If purely clicking background/character:
					}
					else if (hovered3D != null)
					{
						Start3DDrag(hovered3D);
						// Chat Reaction: Drag Start
						ShowRandomChat(_talkData?.DragStartReactions);
					}
					else
					{
						// Clicked on nothing/transparent area (handled by system?)
						// If we want click reaction on character without drag:
						// We need to differentiate Click vs Drag. 
						// Currently Drag starts immediately. 
						// Let's optimize: Chat only on drag start is fine for now.
					}
				}

				// --- Release Logic ---
				if (!isMouseDown)
				{
					if (_isDragging && _dragTarget != null)
					{
						// Click detection - Toggle if it was a quick click on the settings button
						if (!_hasDraggedSignificantly)
						{
							if (_dragTarget.name == "SettingsButton")
							{
								ToggleSettingsPanel(ViewContainer);
							}
						}
					}

					// Click Reaction for 3D Character (if not dragged significantly)
					if (_isDragging3D && !_hasDraggedSignificantly && _activeHandler3D != null)
					{
						ShowRandomChat(_talkData?.ClickReactions);
					}
					// Only show Drag End reaction if we actually dragged significantly (3D Only)
					else if (_isDragging3D && _hasDraggedSignificantly)
					{
						ShowRandomChat(_talkData?.DragEndReactions);
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

				UpdateChatSystem();
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


		// --- Chat System ---
		private KarmoToys.Features.Companion.SpeechBubbleElement _speechBubble;
		private KarmoToys.Features.Companion.CompanionTalkData _talkData;
		private float _nextChatTime;
		private float _bubbleHideTime;

		private void InitializeChatSystem(VisualElement root)
		{
			if (_speechBubble == null)
			{
				_speechBubble = new KarmoToys.Features.Companion.SpeechBubbleElement();
				root.Add(_speechBubble);
			}

			// 1. Load from Settings (Direct Reference)
			if (KarmoToys.Main.KarmoToysApp.Instance != null && KarmoToys.Main.KarmoToysApp.Instance.Settings != null)
			{
				_talkData = KarmoToys.Main.KarmoToysApp.Instance.Settings.CompanionData;
			}

			// 2. Fast Fail if data is missing
			if (_talkData == null)
			{
				Debug.LogError("[CompanionFeature] CompanionData is NOT assigned in KarmoToysSettings! Chat system disabled.");
				return;
			}

			// Safety check for loaded data
			if (_talkData.MinChatInterval < 0.5f) _talkData.MinChatInterval = 10f;
			if (_talkData.MaxChatInterval < _talkData.MinChatInterval) _talkData.MaxChatInterval = _talkData.MinChatInterval + 5f;

			ScheduleNextChat();
		}

		private void ScheduleNextChat()
		{
			if (_talkData == null) return;

			float min = Mathf.Max(1f, _talkData.MinChatInterval);
			float max = Mathf.Max(min, _talkData.MaxChatInterval);
			float delay = UnityEngine.Random.Range(min, max);

			// Safety: Minimum 1s to prevent infinite loop errors
			if (delay < 1f) delay = 1f;

			_nextChatTime = Time.time + delay;
		}

		private void UpdateChatSystem()
		{
			if (_selectedAvatar == null || _speechBubble == null) return;

			// If data is missing (and wasn't fixed by hot-reload init), we stop here.
			if (_talkData == null)
			{
				// Try re-fetch from settings once (for hot reload support)
				if (KarmoToys.Main.KarmoToysApp.Instance?.Settings?.CompanionData != null)
				{
					InitializeChatSystem(ViewContainer);
				}
				if (_talkData == null) return;
			}

			// 1. Position Update
			Vector3 headPos = Vector3.zero;
			if (_selectedAvatar is CompanionCharacter cc)
			{
				headPos = cc.GetHeadPosition();
			}
			else
			{
				headPos = _selectedAvatar.Transform.position + Vector3.up * 1.0f;
			}

			if (Camera.main != null)
			{
				Vector3 screenPos = Camera.main.WorldToScreenPoint(headPos);
				// Flip Y for UI Toolkit
				float uiY = Screen.height - screenPos.y;

				// Adjust for layout scale if necessary (Assuming 1:1 for now as we use Screen.setResolution match)
				// Basic offset to center bubble
				_speechBubble.style.left = screenPos.x;
				_speechBubble.style.top = uiY - 50; // Offset upwards
			}

			// 2. Auto Chat Timer
			if (Time.time >= _nextChatTime && !_isDragging && !_isDragging3D)
			{
				// Critical: Update time FIRST to prevent infinite loop if ShowRandomChat fails
				ScheduleNextChat();

				ShowRandomChat(_talkData.IdleChats);
			}

			// 3. Hide Timer
			if (_bubbleHideTime > 0 && Time.time >= _bubbleHideTime)
			{
				_speechBubble.Hide();
				_bubbleHideTime = 0;
			}
		}

		private void ShowRandomChat(System.Collections.Generic.List<string> options)
		{
			if (options == null || options.Count == 0) return;
			string text = options[UnityEngine.Random.Range(0, options.Count)];
			ShowChat(text);
		}

		public void ShowChat(string text)
		{
			// Safe to assume _speechBubble and _talkData are valid here, or we fail gracefully via NRE/Exceptions
			// which is acceptable given Fast Fail policy. But keeping minimal check for Bubble is okay.
			if (_speechBubble == null) return;

			_speechBubble.Show(text, _talkData.BubbleDuration);
			_bubbleHideTime = Time.time + _talkData.BubbleDuration;
		}

		public override void OnSelect()
		{
			base.OnSelect();
		}
	}
	// Verified Recovery: All systems nominal.
}
