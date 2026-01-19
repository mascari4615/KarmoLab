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
		// Reference to ChatModule (injected or found)
		private ChatModule _chatModule;
		private TimeModule _timeModule;

		// UI State
		private float _uiUpdateTimer;
		private Label _lblStopwatch;
		private VisualElement _timerListContainer; // Container that holds timer rows

		// HUD Settings
		private float _hudOffset = 0.2f;

		// Tab State
		private enum SettingsTab { Avatar, Time }
		private SettingsTab _currentTab = SettingsTab.Avatar;
		private VisualElement _tabContentContainer;

		public void Initialize(CompanionContext context)
		{
			_context = context;

			// Load Persisted Settings
			LoadSettings();

			// Init Settings UI
			InitializeSettingsButton();

			// Find Avatar (Moved from Feature)
			InitializeAvatar();

			// Hook up TimeModule Events if already set (or do in Setter)
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

			// Register click here to avoid re-registration issues
			// Actually Interaction logic handles click, but UI Toolkit click is safer for static buttons
		}

		public void SetChatModule(ChatModule chatParams)
		{
			_chatModule = chatParams;
		}

		public void SetTimeModule(TimeModule timeModule)
		{
			_timeModule = timeModule;
			if (_timeModule != null)
			{
				_timeModule.OnTimerFinished += (msg) => ShowToast(msg);
			}
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
			// If settings panel is open, be less aggressive with click-through?
			bool isSettingsOpen = _settingsPanel != null;
			bool shouldBeClickThrough = !isHovering && !_context.IsDragging && !_context.IsDragging3D;

			// Force non-transparent if settings open and hovering near it? (Already handled by hoveredUI check)

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
					// Check if it's the settings button
					if (hoveredUI == _settingsButton)
					{
						StartUIDrag(hoveredUI);
					}
					// For other UI elements (inside panel), we usually let UI Toolkit handle clicks.
					// But we need to prevent 3D drag if UI is clicked.
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
						if (_dragTarget == _settingsButton)
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

			// UI Updates (Text Only)
			if (_settingsPanel != null && _timeModule != null)
			{
				_uiUpdateTimer += Time.deltaTime;
				if (_uiUpdateTimer > 0.1f)
				{
					_uiUpdateTimer = 0f;
					RefreshSettingsUI(); // Renamed to Generic
				}
			}

			// Overhead HUD Update (Run every frame for smooth movement, or throttle if heavy)
			UpdateOverheadUI();
		}

		private Label _overheadLabel;

		private void CreateOverheadUI()
		{
			if (_overheadLabel != null) return;

			_overheadLabel = new Label()
			{
				name = "OverheadTimeHUD",
				style =
				{
					position = Position.Absolute,
					backgroundColor = new Color(0, 0, 0, 0.6f),
					color = new Color(1, 1, 1, 0.9f),
					fontSize = 14,
					paddingLeft = 8, paddingRight = 8, paddingTop = 4, paddingBottom = 4,
					borderTopLeftRadius = 12, borderTopRightRadius = 12,
					borderBottomLeftRadius = 12, borderBottomRightRadius = 12,
					unityTextAlign = TextAnchor.MiddleCenter,
					visibility = Visibility.Hidden // Default hidden
				},
				pickingMode = PickingMode.Ignore // Click-through
			};

			_context.RootUI.Add(_overheadLabel);
		}

		private void UpdateOverheadUI()
		{
			// 1. Check Requirements
			if (_context.SelectedAvatar == null || _timeModule == null)
			{
				if (_overheadLabel != null) _overheadLabel.style.visibility = Visibility.Hidden;
				return;
			}

			// Ensure UI exists
			CreateOverheadUI();

			// 2. Gather Data
			bool swRunning = _timeModule.GetStopwatchTime() > 0; // Simple check, ideally need IsRunning state
																 // Better check: If stopwatch value > 0.1f. 
																 // We need a better way to know if stopwatch is "active" vs "paused/reset".
																 // For now, let's show if > 0.

			var timers = _timeModule.GetTimers();
			bool timerRunning = timers.Count > 0;

			if (!swRunning && !timerRunning)
			{
				_overheadLabel.style.visibility = Visibility.Hidden;
				return;
			}

			// 3. compose Text
			System.Text.StringBuilder sb = new System.Text.StringBuilder();

			if (swRunning)
			{
				TimeSpan sw = TimeSpan.FromSeconds(_timeModule.GetStopwatchTime());
				sb.Append($"⏱️ {sw.Minutes:00}:{sw.Seconds:00}");
			}

			if (timerRunning)
			{
				if (swRunning) sb.Append("  |  "); // Separator

				// Show shortest timer or just count?
				// Showing the first one (most urgent usually if sorted, but List is adding order)
				// Let's Find min time
				var urgentTimer = timers.OrderBy(t => t.RemainingTime).First();
				sb.Append($"⏳ {urgentTimer.RemainingTime:F0}s");

				if (timers.Count > 1) sb.Append($" (+{timers.Count - 1})");
			}

			_overheadLabel.text = sb.ToString();
			_overheadLabel.style.visibility = Visibility.Visible;

			// 4. Update Position
			if (Camera.main != null)
			{
				// Get Head Position (Approximate via Collider bounds or Transform + Offset)
				Vector3 worldPos = _context.SelectedAvatar.Transform.position;

				// Try to find height
				float height = 1.8f; // Default human height
				var col = _context.SelectedAvatar.Transform.GetComponentInChildren<Collider>();
				if (col != null) height = col.bounds.max.y - _context.SelectedAvatar.Transform.position.y;

				// Add offset
				worldPos.y += height + _hudOffset; // Floating above head

				Vector3 screenPos = Camera.main.WorldToScreenPoint(worldPos);

				// Check if behind camera
				if (screenPos.z < 0)
				{
					_overheadLabel.style.visibility = Visibility.Hidden;
				}
				else
				{
					// Convert Screen Space to UI Toolkit Panel Space
					// UI Toolkit coordinates match Screen coordinates (0,0 is top-left usually, but Unity Screen is bottom-left)
					// Warning: Runtime UI Toolkit PanelSettings matchScreenSize might affect this.

					// Assuming PanelSettings is set to Scale With Screen Size or similar, we might need adjustments.
					// But for Screen Space Overlay, simple conversion usually works if we flip Y.

					float panelHeight = _context.ViewContainer.layout.height;
					// If layout hasn't calculated yet, this might be 0.
					if (float.IsNaN(panelHeight) || panelHeight == 0) panelHeight = Screen.height;

					// Screen.height - sc.y is standard conversion for UIElements (Top-Left origin) vs Unity Screen (Bottom-Left)
					float uiX = screenPos.x;
					float uiY = Screen.height - screenPos.y;

					// Center alignment adjustment
					float labelWidth = _overheadLabel.layout.width;
					float labelHeight = _overheadLabel.layout.height;

					// Apply
					_overheadLabel.style.left = uiX - (labelWidth / 2);
					_overheadLabel.style.top = uiY - (labelHeight / 2);
				}
			}
		}

		public void OnDestroy()
		{
			// Cleanup UI
			if (_settingsPanel != null) _settingsPanel.RemoveFromHierarchy();
			if (_settingsButton != null) _settingsButton.RemoveFromHierarchy();
			if (_overheadLabel != null) _overheadLabel.RemoveFromHierarchy();
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
					backgroundColor = new Color(0, 0, 0, 0.9f),
					paddingTop = 10, paddingBottom = 10, paddingLeft = 10, paddingRight = 10,
					borderTopLeftRadius = 10, borderTopRightRadius = 10,
					borderBottomLeftRadius = 10, borderBottomRightRadius = 10,
					position = Position.Absolute,
					top = panelTop, left = panelLeft,
					width = 280
				}
			};

			// Header with Tabs
			VisualElement header = new VisualElement { style = { flexDirection = FlexDirection.Row, marginBottom = 10, justifyContent = Justify.SpaceBetween } };

			// Tab Buttons
			header.Add(CreateTabButton("Avatar", SettingsTab.Avatar));
			header.Add(CreateTabButton("Time", SettingsTab.Time));

			_settingsPanel.Add(header);

			// Content Container
			_tabContentContainer = new VisualElement { name = "TabContent" };
			_settingsPanel.Add(_tabContentContainer);

			root.Add(_settingsPanel);

			// Render Initial Tab
			RenderCurrentTab();
		}

		private Button CreateTabButton(string text, SettingsTab tab)
		{
			Button btn = new Button(() =>
			{
				_currentTab = tab;
				RenderCurrentTab();
			})
			{ text = text };

			// Style (Simple)
			btn.style.flexGrow = 1;
			btn.style.backgroundColor = new Color(0.2f, 0.2f, 0.2f);
			btn.style.color = Color.white;
			btn.style.borderRightWidth = 0; btn.style.borderLeftWidth = 0; btn.style.borderTopWidth = 0; btn.style.borderBottomWidth = 0;

			// Highlight current? (Will be refreshed in RenderCurrentTab if we want, or just simple logic)

			return btn;
		}

		private void RenderCurrentTab()
		{
			if (_tabContentContainer == null) return;
			_tabContentContainer.Clear();

			switch (_currentTab)
			{
				case SettingsTab.Avatar:
					BuildAvatarTab(_tabContentContainer);
					break;
				case SettingsTab.Time:
					BuildTimeTab(_tabContentContainer);
					// Important: Reset UI references that need updates
					_timerListContainer = _tabContentContainer.Q<VisualElement>("TimerList");
					_lblStopwatch = _tabContentContainer.Q<Label>("StopwatchLabel");
					break;
			}
		}

		private void BuildAvatarTab(VisualElement parent)
		{
			parent.Add(new Label("Avatar Settings") { style = { color = Color.yellow, marginTop = 5, unityFontStyleAndWeight = FontStyle.Bold } });

			if (_context.SelectedAvatar == null)
			{
				parent.Add(new Label("No Avatar Selected") { style = { color = Color.gray } });
				return;
			}

			// Info
			parent.Add(new Label($"Target: {_context.SelectedAvatar.Transform.name}") { style = { fontSize = 12, marginBottom = 10, color = Color.cyan } });

			// Scale
			parent.Add(new Label("Scale") { style = { fontSize = 12, color = Color.white } });
			Slider scaleSlider = new Slider(0.1f, 5.0f) { value = _context.SelectedAvatar.Transform.localScale.x };
			scaleSlider.RegisterValueChangedCallback((ChangeEvent<float> evt) =>
			{
				if (_context.SelectedAvatar != null) _context.SelectedAvatar.Transform.localScale = Vector3.one * evt.newValue;
			});
			parent.Add(scaleSlider);

			// Rotation
			parent.Add(new Label("Rotation (Y)") { style = { fontSize = 12, color = Color.white, marginTop = 10 } });
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
			parent.Add(rotateSlider);
		}

		private void BuildTimeTab(VisualElement parent)
		{
			if (_timeModule == null)
			{
				parent.Add(new Label("Time Module Not Loaded") { style = { color = Color.red } });
				return;
			}

			parent.Add(new Label("Stopwatch & Timers") { style = { color = Color.green, marginTop = 5, unityFontStyleAndWeight = FontStyle.Bold } });

			// Stopwatch Row
			VisualElement swRow = new VisualElement();
			swRow.style.flexDirection = FlexDirection.Row;
			swRow.style.alignItems = Align.Center;
			swRow.style.marginTop = 10;
			swRow.style.backgroundColor = new Color(0.1f, 0.1f, 0.1f);
			swRow.style.paddingLeft = 5;
			swRow.style.paddingRight = 5;
			swRow.style.paddingTop = 5;
			swRow.style.paddingBottom = 5;
			swRow.style.borderBottomLeftRadius = 5;
			swRow.style.borderBottomRightRadius = 5;
			swRow.style.borderTopLeftRadius = 5;
			swRow.style.borderTopRightRadius = 5;

			Label lblSw = new Label("00:00")
			{
				name = "StopwatchLabel",
				style = { color = Color.white, fontSize = 24, unityFontStyleAndWeight = FontStyle.Bold, width = 100 }
			};
			swRow.Add(lblSw);

			// Buttons
			Button btnToggle = new Button();
			btnToggle.text = "Start";
			btnToggle.name = "BtnStopwatchToggle";
			btnToggle.style.width = 60;
			btnToggle.style.height = 30;
			btnToggle.style.backgroundColor = new Color(0, 0.5f, 0);

			// Click handler
			btnToggle.clicked += () =>
			{
				bool currentlyRunning = btnToggle.text == "Stop";
				_timeModule.ToggleStopwatch(!currentlyRunning);

				// Immediate visual feedback
				btnToggle.text = currentlyRunning ? "Start" : "Stop";
				lblSw.name = currentlyRunning ? "Paused" : "Running"; // Used for state tracking

				// MDD Reaction 🌸
				if (!currentlyRunning) // Starting
				{
					string[] startMsg = { "시작! 집중해! 👀", "파이팅! 지켜볼게!", "기록 시작! 달리자! 🏃‍♀️" };
					_chatModule?.ShowChat(startMsg[UnityEngine.Random.Range(0, startMsg.Length)]);
				}
				else // Stopping
				{
					string[] stopMsg = { "수고했어! 🍵", "기록은 어때?", "잠깐 쉬는거야?" };
					_chatModule?.ShowChat(stopMsg[UnityEngine.Random.Range(0, stopMsg.Length)]);
				}
			};
			btnToggle.style.backgroundColor = new Color(0, 0.5f, 0); // Correct style application logic
			btnToggle.style.width = 60;
			btnToggle.style.height = 30;
			swRow.Add(btnToggle);

			Button btnReset = new Button(() =>
			{
				_timeModule.ResetStopwatch();
				lblSw.text = "00:00";
				btnToggle.text = "Start";
				lblSw.name = "Reset";
				_chatModule?.ShowChat("리셋 완료! 다시 해볼까? 🔄");
			})
			{ text = "R", style = { width = 30, height = 30, marginLeft = 5, backgroundColor = new Color(0.5f, 0, 0) } };
			swRow.Add(btnReset);

			parent.Add(swRow);

			// --- Timer ---
			parent.Add(new Label("Quick Timer") { style = { color = Color.white, marginTop = 15, fontSize = 12 } });
			VisualElement timerRow = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center } };
			TextField txtDur = new TextField { value = "60", style = { width = 50 } };
			timerRow.Add(txtDur);

			Button btnAddTimer = new Button(() =>
			{
				if (float.TryParse(txtDur.value, out float d))
				{
					_timeModule.StartTimer(d);
					// Rebuild list will happen in Refresh
					// ShowToast($"Timer connected: {d}s"); // REmoved to avoid confusion

					// MDD Reaction 🌸
					string[] setMsg = { $"{d:F0}초 뒤에 알려줄게!", "타이머 설정 완료! 👌", "절대 안 까먹을게!" };
					_chatModule?.ShowChat(setMsg[UnityEngine.Random.Range(0, setMsg.Length)]);
				}
			})
			{ text = "+ Set", style = { flexGrow = 1, marginLeft = 5 } };
			timerRow.Add(btnAddTimer);
			parent.Add(timerRow);

			// HUD Settings Section
			VisualElement hudSection = new VisualElement { style = { marginTop = 15, borderTopWidth = 1, borderTopColor = new Color(0.3f, 0.3f, 0.3f), paddingTop = 5 } };
			hudSection.Add(new Label("HUD Height Adjustment") { style = { color = Color.gray, fontSize = 10 } });

			Slider offsetSlider = new Slider(-0.5f, 1.5f) { value = _hudOffset };
			offsetSlider.RegisterValueChangedCallback(evt =>
			{
				_hudOffset = evt.newValue;
				SaveSettings();
			});
			hudSection.Add(offsetSlider);

			parent.Add(hudSection);
		}

		private void LoadSettings()
		{
			// Use App Data instead of PlayerPrefs
			if (KarmoToys.Main.KarmoToysApp.Instance != null && KarmoToys.Main.KarmoToysApp.Instance.Data != null)
			{
				_hudOffset = KarmoToys.Main.KarmoToysApp.Instance.Data.Companion.HudOffset;
			}
		}

		private void SaveSettings()
		{
			if (KarmoToys.Main.KarmoToysApp.Instance != null && KarmoToys.Main.KarmoToysApp.Instance.Data != null)
			{
				KarmoToys.Main.KarmoToysApp.Instance.Data.Companion.HudOffset = _hudOffset;
				KarmoToys.Main.KarmoToysApp.Instance.SaveData(); // Use Global Save
			}
		}

		private void RefreshSettingsUI()
		{
			// Only update if Time Tab is active
			if (_currentTab != SettingsTab.Time) return;
			if (_timeModule == null) return;

			// 1. Update Stopwatch Text
			if (_lblStopwatch != null)
			{
				float t = _timeModule.GetStopwatchTime();
				TimeSpan ts = TimeSpan.FromSeconds(t);
				_lblStopwatch.text = string.Format("{0:00}:{1:00}", ts.Minutes, ts.Seconds);
			}

			// 2. Update Timer List (Without full rebuild if possible, but full rebuild of list is okay for small item counts)
			// Optimizaion: Only rebuild if count changes to avoid button flicker?
			// For now, let's do a partial update strategy: 
			// Check existing children vs TimeModule active timers.
			if (_timerListContainer != null)
			{
				var timers = _timeModule.GetTimers();
				int childCount = _timerListContainer.childCount;

				// Simple approach: Clear and rebuild ONLY if count differs. 
				// Otherwise just update text.
				// (This assumes order doesn't change, which is true for List usually)

				if (childCount != timers.Count)
				{
					_timerListContainer.Clear();
					foreach (var timer in timers)
					{
						VisualElement row = new VisualElement();
						row.style.flexDirection = FlexDirection.Row;
						row.style.justifyContent = Justify.SpaceBetween;
						row.style.backgroundColor = new Color(0.2f, 0.2f, 0.2f);
						row.style.paddingLeft = 2; row.style.paddingRight = 2; row.style.paddingTop = 2; row.style.paddingBottom = 2;
						row.style.marginBottom = 2;
						row.style.borderTopLeftRadius = 4; row.style.borderTopRightRadius = 4;
						row.style.borderBottomLeftRadius = 4; row.style.borderBottomRightRadius = 4;

						Label lbl = new Label() { style = { color = Color.white } }; // Content updated below
						Button btnKill = new Button(() =>
						{
							_timeModule.StopTimer(timer.Id);
							// Will trigger rebuild next frame
						})
						{ text = "x", style = { width = 20, height = 18, fontSize = 10, backgroundColor = Color.gray } };

						row.Add(lbl);
						row.Add(btnKill);
						_timerListContainer.Add(row);
					}
				}

				// Update Texts
				for (int i = 0; i < timers.Count; i++)
				{
					if (i < _timerListContainer.childCount)
					{
						var row = _timerListContainer[i];
						var label = row.Q<Label>();
						var timer = timers[i];
						if (label != null)
						{
							label.text = $"{timer.Label}: {timer.RemainingTime:F0}s";
							if (timer.RemainingTime <= 0) label.style.color = Color.red;
							else label.style.color = Color.white;
						}
					}
				}
			}
		}

		public void ShowToast(string message)
		{
			if (_context.RootUI == null) return;

			Label toast = new Label(message)
			{
				style =
				{
					position = Position.Absolute,
					top = Length.Percent(50),
					left = Length.Percent(50),
					unityTextAlign = TextAnchor.MiddleCenter,
					color = Color.white,
					backgroundColor = new Color(0, 0, 0, 0.8f),
					paddingTop = 20, paddingBottom = 20, paddingLeft = 40, paddingRight = 40,
					fontSize = 24,
					borderTopLeftRadius = 20, borderTopRightRadius = 20,
					borderBottomLeftRadius = 20, borderBottomRightRadius = 20,
					translate = new Translate(Length.Percent(-50), Length.Percent(-50), 0)
				}
			};

			// Center logic is handled by top/left/translate
			// toast.style.marginLeft = Length.Auto(); 
			// toast.style.marginRight = Length.Auto();
			// toast.style.width = 200; // Let it auto-size or set min-width?

			_context.RootUI.Add(toast);

			// Animate
			toast.schedule.Execute(() =>
			{
				_context.RootUI.Remove(toast);
			}).StartingIn(3000);
		}
	}
}
