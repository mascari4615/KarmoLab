using System;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Features.Companion;
using KarmoToys.Common;
using KarmoToys.Common.UI;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace KarmoToys.Features.Companion.Modules
{
	public class InteractionModule : ICompanionModule
	{
		private CompanionContext _context;
		private readonly System.Collections.Concurrent.ConcurrentQueue<Action> _mainThreadActions = new();

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
		private TimeModule _timeModule;

		// UI State
		private float _uiUpdateTimer;
		private Label _lblStopwatch;
		private Label _lblPomodoro;
		private Label _lblKeyboardStats;
		private VisualElement _timerListContainer;

		// HUD Settings
		private float _hudOffset = 0.2f;

		// Tab State
		private enum SettingsTab { Avatar, Time, Keyboard }
		private SettingsTab _currentTab = SettingsTab.Avatar;

		// UXML Elements References
		private VisualElement _avatarTabContent;
		private VisualElement _timeTabContent;
		private VisualElement _keyboardTabContent;

		public void Initialize(CompanionContext context)
		{
			_context = context;

			// Load Persisted Settings
			LoadSettings();

			// Init Settings UI (Gear Icon)
			InitializeSettingsButton();

			// Find Avatar (Moved from Feature)
			InitializeAvatar();
		}

		private void InitializeSettingsButton()
		{
			if (_context.RootUI == null) return;

			// Find pre-composed button from MainView
			_settingsButton = _context.RootUI.Q<Button>("BtnCompanionSettings");

			if (_settingsButton == null)
			{
				Debug.LogWarning("[InteractionModule] BtnCompanionSettings not found in RootUI. Composition might be missing.");
			}
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
			IDragHandler[] handlers = GameObject.FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None).OfType<IDragHandler>().ToArray();
			List<IDragHandler> avatarHandlers = new List<IDragHandler>();

			foreach (IDragHandler h in handlers)
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
			bool isSettingsOpen = _settingsPanel != null;
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
					// Check if it's the settings button (or any of its children, e.g. the gear icon text)
					if (_settingsButton == hoveredUI || _settingsButton.Contains(hoveredUI))
					{
						StartUIDrag(_settingsButton);
					}
				}
				else if (hovered3D != null)
				{
					Start3DDrag(hovered3D);
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
					_chatModule.ShowRandomChat(_context.Settings.CompanionData?.ClickReactions);
				}
				else if (_context.IsDragging3D && _hasDraggedSignificantly)
				{
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

			// Main Thread Actions
			while (_mainThreadActions.TryDequeue(out Action action)) action?.Invoke();

			// UI Updates (Text Only)
			_uiUpdateTimer += Time.deltaTime;
			if (_uiUpdateTimer > 0.1f)
			{
				_uiUpdateTimer = 0f;
				RefreshSettingsUI();
			}

			// Overhead HUD Update 
			UpdateOverheadUI();
		}

		private Label _overheadLabel;

		private void CreateOverheadUI()
		{
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
			if (_context.SelectedAvatar == null)
			{
				if (_overheadLabel != null) _overheadLabel.style.visibility = Visibility.Hidden;
				return;
			}

			if (_overheadLabel == null) EnsureOverheadUI();

			// 2. Gather Data
			bool swRunning = _timeModule.GetStopwatchTime() > 0;
			List<TimeModule.TimerData> timers = _timeModule.GetTimers();
			bool timerRunning = timers.Count > 0;
			TimeModule.PomodoroData pomo = _timeModule.GetPomodoro();
			bool pomoRunning = pomo.Phase != TimeModule.PomodoroPhase.None;

			if (!swRunning && !timerRunning && !pomoRunning)
			{
				_overheadLabel.style.visibility = Visibility.Hidden;
				return;
			}

			// 3. compose Text
			System.Text.StringBuilder sb = new();

			if (swRunning)
			{
				TimeSpan sw = TimeSpan.FromSeconds(_timeModule.GetStopwatchTime());
				sb.Append($"⏱️ {sw.Minutes:00}:{sw.Seconds:00}");
			}

			if (timerRunning)
			{
				if (swRunning) sb.Append("  |  ");
				TimeModule.TimerData urgentTimer = timers.OrderBy(t => t.RemainingTime).First();
				sb.Append($"⏳ {urgentTimer.RemainingTime:F0}s");
				if (timers.Count > 1) sb.Append($" (+{timers.Count - 1})");
			}

			if (pomo.Phase != TimeModule.PomodoroPhase.None)
			{
				if (swRunning || timerRunning) sb.Append("  |  ");
				string icon = pomo.Phase == TimeModule.PomodoroPhase.Work ? "🍅" : (pomo.Phase == TimeModule.PomodoroPhase.LongBreak ? "🛀" : "☕");
				TimeSpan ts = TimeSpan.FromSeconds(pomo.RemainingTime);
				sb.Append($"{icon} {ts.Minutes:00}:{ts.Seconds:00}");
			}

			_overheadLabel.text = sb.ToString();
			_overheadLabel.style.visibility = Visibility.Visible;

			// 4. Update Position
			if (Camera.main != null)
			{
				// Get Head Position
				Vector3 worldPos;
				if (_context.SelectedAvatar is CompanionCharacter cc)
				{
					worldPos = cc.GetHeadPosition();
				}
				else
				{
					// Fallback
					float height = 1.8f; // Default human height
					Collider col = _context.SelectedAvatar.Transform.GetComponentInChildren<Collider>();
					if (col != null) height = col.bounds.max.y - _context.SelectedAvatar.Transform.position.y;
					worldPos = _context.SelectedAvatar.Transform.position + Vector3.up * height;
				}

				// Add offset
				worldPos.y += _hudOffset;

				Vector3 screenPos = Camera.main.WorldToScreenPoint(worldPos);

				if (screenPos.z < 0)
				{
					_overheadLabel.style.visibility = Visibility.Hidden;
				}
				else
				{
					float panelHeight = _context.ViewContainer.layout.height;
					if (float.IsNaN(panelHeight) || panelHeight == 0) panelHeight = Screen.height;

					float uiX = screenPos.x;
					float uiY = Screen.height - screenPos.y;

					float labelWidth = _overheadLabel.layout.width;
					float labelHeight = _overheadLabel.layout.height;

					_overheadLabel.style.left = uiX - (labelWidth / 2);
					_overheadLabel.style.top = uiY - (labelHeight / 2);
				}
			}
		}

		private void EnsureOverheadUI()
		{
			if (_overheadLabel == null) CreateOverheadUI();
		}

		public void OnDestroy()
		{
			// Cleanup UI
			if (_settingsPanel != null) _settingsPanel.RemoveFromHierarchy();
			if (_settingsButton != null) _settingsButton.RemoveFromHierarchy();
			if (_overheadLabel != null) _overheadLabel.RemoveFromHierarchy();
		}

		// --- Helpers (Raycast, Drag Logic) ---

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

		private bool _isSettingsBound = false;

		private void ToggleSettingsPanel(VisualElement root)
		{
			if (_settingsPanel == null)
			{
				_settingsPanel = root.Q<VisualElement>("CompanionSettingsPanel");
			}

			if (_settingsPanel == null)
			{
				Debug.LogError("[InteractionModule] CompanionSettingsPanel not found in RootUI!");
				return;
			}

			bool isVisible = _settingsPanel.style.display == DisplayStyle.Flex;

			if (isVisible)
			{
				_settingsPanel.style.display = DisplayStyle.None;
			}
			else
			{
				_settingsPanel.style.display = DisplayStyle.Flex;

				// Position panel below button
				float panelTop = _settingsButton.resolvedStyle.top + _settingsButton.resolvedStyle.height + 10;
				float panelLeft = _settingsButton.resolvedStyle.left;

				_settingsPanel.style.top = panelTop;
				_settingsPanel.style.left = panelLeft;

				// Bind only once
				if (!_isSettingsBound)
				{
					BindUIElements();
					_isSettingsBound = true;
				}

				UpdateTabDisplay();
			}
		}

		private void BindUIElements()
		{
			if (_settingsPanel == null) return;

			// 1. Tabs
			_settingsPanel.Q<Button>("TabAvatar")?.RegisterCallback<ClickEvent>(evt => { _currentTab = SettingsTab.Avatar; UpdateTabDisplay(); });
			_settingsPanel.Q<Button>("TabTime")?.RegisterCallback<ClickEvent>(evt => { _currentTab = SettingsTab.Time; UpdateTabDisplay(); });
			_settingsPanel.Q<Button>("TabKeyboard")?.RegisterCallback<ClickEvent>(evt => { _currentTab = SettingsTab.Keyboard; UpdateTabDisplay(); });

			_avatarTabContent = _settingsPanel.Q<VisualElement>("AvatarTabContent");
			_timeTabContent = _settingsPanel.Q<VisualElement>("TimeTabContent");
			_keyboardTabContent = _settingsPanel.Q<VisualElement>("KeyboardTabContent");

			// 2. Avatar Settings
			BindAvatarSettings();

			// 3. Time Settings
			BindTimeSettings();

			// 4. Keyboard Settings
			BindKeyboardSettings();

			// 5. Other Settings
			BindOtherSettings();
		}

		private void BindKeyboardSettings()
		{
			KarmoToys.Common.Data.CompanionData compData = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
			if (compData == null) return;

			Toggle overlayToggle = _settingsPanel.Q<Toggle>("KeyboardOverlayToggle");
			if (overlayToggle != null)
			{
				overlayToggle.value = compData.ShowKeyboardOverlay;
				overlayToggle.value = compData.ShowKeyboardOverlay;
				overlayToggle.RegisterValueChangedCallback(evt => { compData.ShowKeyboardOverlay = evt.newValue; SaveSettings(); });
			}

            Toggle vkToggle = _settingsPanel.Q<Toggle>("VirtualKeyboardToggle");
			if (vkToggle != null)
			{
				vkToggle.value = compData.ShowVirtualKeyboard;
				vkToggle.RegisterValueChangedCallback(evt => { compData.ShowVirtualKeyboard = evt.newValue; SaveSettings(); });
			}

			// Layout & Scale
			EnumField layoutEnum = _settingsPanel.Q<EnumField>("LayoutEnum");
			if (layoutEnum != null)
			{
				layoutEnum.Init(compData.CurrentLayout);
				layoutEnum.RegisterValueChangedCallback(evt => 
				{ 
					compData.CurrentLayout = (KarmoToys.Common.Data.KeyboardLayoutType)evt.newValue; 
					SaveSettings(); 
				});
			}

			Slider scaleSlider = _settingsPanel.Q<Slider>("KeyboardScaleSlider");
			if (scaleSlider != null)
			{
				scaleSlider.value = compData.KeyboardScale;
				scaleSlider.RegisterValueChangedCallback(evt => { compData.KeyboardScale = evt.newValue; SaveSettings(); });
			}

			Toggle sfxToggle = _settingsPanel.Q<Toggle>("KeyboardSfxToggle");
			if (sfxToggle != null)
			{
				sfxToggle.value = compData.PlayKeyboardSfx;
				sfxToggle.RegisterValueChangedCallback(evt => { compData.PlayKeyboardSfx = evt.newValue; SaveSettings(); });
			}

			Slider volSlider = _settingsPanel.Q<Slider>("KeyboardVolumeSlider");
			if (volSlider != null)
			{
				volSlider.value = compData.KeyboardSfxVolume;
				volSlider.RegisterValueChangedCallback(evt => { compData.KeyboardSfxVolume = evt.newValue; SaveSettings(); });
			}

			Label kbSfxPathLabel = _settingsPanel.Q<Label>("KeyboardSfxPathLabel");
			_settingsPanel.Q<Button>("BtnBrowseKeyboardSfx")?.RegisterCallback<ClickEvent>(evt =>
			{
#if UNITY_EDITOR && !UNITY_STANDALONE_WIN
				string path = UnityEditor.EditorUtility.OpenFilePanel("Select Keyboard SFX", "", "mp3,wav,ogg");
				if (!string.IsNullOrEmpty(path))
				{
					compData.KeyboardSfxPath = path;
					if (kbSfxPathLabel != null) kbSfxPathLabel.text = System.IO.Path.GetFileName(path);
					SaveSettings();
				}
#else
				KarmoToys.Core.Utils.Win32FileBrowser.OpenFilePanelAsync("Select Keyboard SFX", "", "Audio Files\0*.mp3;*.wav;*.ogg\0All Files\0*.*\0\0", path => 
				{
					_mainThreadActions.Enqueue(() => 
					{
						if (!string.IsNullOrEmpty(path))
						{
							compData.KeyboardSfxPath = path;
							if (kbSfxPathLabel != null) kbSfxPathLabel.text = System.IO.Path.GetFileName(path);
							SaveSettings();
						}
					});
				});
#endif
			});

			_settingsPanel.Q<Button>("BtnClearKeyboardSfx")?.RegisterCallback<ClickEvent>(evt =>
			{
				compData.KeyboardSfxPath = "";
				if (kbSfxPathLabel != null) kbSfxPathLabel.text = "Default";
				SaveSettings();
			});

			Slider thresholdSlider = _settingsPanel.Q<Slider>("KeyboardRowThresholdSlider");
			if (thresholdSlider != null)
			{
				thresholdSlider.value = compData.KeyboardRowSeparationThreshold;
				thresholdSlider.RegisterValueChangedCallback(evt => { compData.KeyboardRowSeparationThreshold = evt.newValue; SaveSettings(); });
			}

			Slider fontSizeSlider = _settingsPanel.Q<Slider>("KeyboardFontSizeSlider");
			if (fontSizeSlider != null)
			{
				fontSizeSlider.value = compData.KeyboardFontSize;
				fontSizeSlider.RegisterValueChangedCallback(evt => { compData.KeyboardFontSize = evt.newValue; SaveSettings(); });
			}

			_lblKeyboardStats = _settingsPanel.Q<Label>("KeyboardTotalStatsLabel");
		}

		private void BindAvatarSettings()
		{
			Label targetLabel = _settingsPanel.Q<Label>("AvatarTargetLabel");
			if (targetLabel != null && _context.SelectedAvatar != null)
			{
				targetLabel.text = $"Target: {_context.SelectedAvatar.Transform.name}";
			}

			Slider scaleSlider = _settingsPanel.Q<Slider>("ScaleSlider");
			if (scaleSlider != null && _context.SelectedAvatar != null)
			{
				scaleSlider.value = _context.SelectedAvatar.Transform.localScale.x;
				scaleSlider.RegisterValueChangedCallback(evt =>
				{
					if (_context.SelectedAvatar != null)
						_context.SelectedAvatar.Transform.localScale = Vector3.one * evt.newValue;
				});
			}

			Slider rotateSlider = _settingsPanel.Q<Slider>("RotateSlider");
			if (rotateSlider != null && _context.SelectedAvatar != null)
			{
				rotateSlider.value = _context.SelectedAvatar.Transform.localEulerAngles.y;
				rotateSlider.RegisterValueChangedCallback(evt =>
				{
					if (_context.SelectedAvatar != null)
					{
						Vector3 rot = _context.SelectedAvatar.Transform.localEulerAngles;
						rot.y = evt.newValue;
						_context.SelectedAvatar.Transform.localEulerAngles = rot;
					}
				});
			}
		}

		private void BindTimeSettings()
		{
			// Stopwatch
			_lblStopwatch = _settingsPanel.Q<Label>("StopwatchLabel");
			Button btnSwToggle = _settingsPanel.Q<Button>("BtnStopwatchToggle");
			Button btnSwReset = _settingsPanel.Q<Button>("BtnStopwatchReset");

			if (btnSwToggle != null)
			{
				btnSwToggle.clicked += () =>
				{
					bool currentlyRunning = btnSwToggle.text == "Stop";
					_timeModule.ToggleStopwatch(!currentlyRunning);
					btnSwToggle.text = currentlyRunning ? "Start" : "Stop";

					// Reactions
					if (!currentlyRunning) _chatModule?.ShowChat("시작! 집중해! 👀");
					else _chatModule?.ShowChat("수고했어! 🍵");
				};
			}
			if (btnSwReset != null)
			{
				btnSwReset.clicked += () =>
				{
					_timeModule.ResetStopwatch();
					if (btnSwToggle != null) btnSwToggle.text = "Start";
					_chatModule?.ShowChat("리셋 완료! 🔄");
				};
			}

			// Quick Timer
			TextField txtDur = _settingsPanel.Q<TextField>("TimerDurationMap");
			Button btnAddTimer = _settingsPanel.Q<Button>("BtnAddTimer");

			// Bind Timer List Container from UXML
			_timerListContainer = _settingsPanel.Q<VisualElement>("TimerList");

			if (btnAddTimer != null && txtDur != null)
			{
				btnAddTimer.clicked += () =>
				{
					if (float.TryParse(txtDur.value, out float d))
					{
						_timeModule.StartTimer(d);
						_chatModule?.ShowChat($"{d:F0}초 뒤에 알려줄게!");
						RefreshSettingsUI(); // Immediate update
					}
				};
			}

			// Pomodoro
			_lblPomodoro = _settingsPanel.Q<Label>("PomodoroLabel");
			Button btnPomoToggle = _settingsPanel.Q<Button>("BtnPomoToggle");
			Button btnPomoSkip = _settingsPanel.Q<Button>("BtnPomoSkip");
			Button btnPomoReset = _settingsPanel.Q<Button>("BtnPomoReset");

			if (btnPomoToggle != null)
			{
				// Sync Initial State
				btnPomoToggle.text = _timeModule.GetPomodoro().IsRunning ? "Pause" : "Start";

				btnPomoToggle.clicked += () =>
				{
					TimeModule.PomodoroData p = _timeModule.GetPomodoro();
					if (p.IsRunning) _timeModule.PausePomodoro();
					else _timeModule.StartPomodoro();
					btnPomoToggle.text = _timeModule.GetPomodoro().IsRunning ? "Pause" : "Start";
				};
			}

			if (btnPomoSkip != null) btnPomoSkip.clicked += () => _timeModule.SkipPomodoro();
			if (btnPomoReset != null) btnPomoReset.clicked += () =>
			{
				_timeModule.ResetPomodoro();
				if (btnPomoToggle != null) btnPomoToggle.text = "Start";
			};

			// Pomodoro Durations (TimePickerField)
			KarmoToys.Common.Data.CompanionData data = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
			if (data != null)
			{
				TimePickerField workPicker = _settingsPanel.Q<TimePickerField>("PomoWorkDuration");
				if (workPicker != null)
				{
					workPicker.SetValueWithoutNotify(data.PomodoroWorkDuration);
					workPicker.OnValueChanged += (float val) => { data.PomodoroWorkDuration = val; SaveSettings(); };
				}

				TimePickerField breakPicker = _settingsPanel.Q<TimePickerField>("PomoBreakDuration");
				if (breakPicker != null)
				{
					breakPicker.SetValueWithoutNotify(data.PomodoroShortBreakDuration);
					breakPicker.OnValueChanged += (float val) => { data.PomodoroShortBreakDuration = val; SaveSettings(); };
				}
			}
		}

		private void BindOtherSettings()
		{
			// Sounds
			KarmoToys.Common.Data.CompanionData compData = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
			if (compData != null)
			{
				Toggle beepToggle = _settingsPanel.Q<Toggle>("BeepToggle");
				if (beepToggle != null)
				{
					beepToggle.value = compData.UseBeep;
					beepToggle.RegisterValueChangedCallback(evt => { compData.UseBeep = evt.newValue; SaveSettings(); });
				}

				Slider volSlider = _settingsPanel.Q<Slider>("VolumeSlider");
				if (volSlider != null)
				{
					volSlider.value = compData.AlarmVolume;
					volSlider.RegisterValueChangedCallback(evt => { compData.AlarmVolume = evt.newValue; SaveSettings(); });
				}

				Label pathLabel = _settingsPanel.Q<Label>("SoundPathLabel");
				if (pathLabel != null)
				{
					pathLabel.text = string.IsNullOrEmpty(compData.CustomAlarmPath) ? "Default Beep/Clip" : System.IO.Path.GetFileName(compData.CustomAlarmPath);
					pathLabel.tooltip = compData.CustomAlarmPath;
				}

				_settingsPanel.Q<Button>("BtnBrowseSound")?.RegisterCallback<ClickEvent>(evt =>
				{
#if UNITY_EDITOR && !UNITY_STANDALONE_WIN
					string path = UnityEditor.EditorUtility.OpenFilePanel("Select Alarm Sound", "", "mp3,wav,ogg");
					if (!string.IsNullOrEmpty(path))
					{
						compData.CustomAlarmPath = path;
						if (beepToggle != null) beepToggle.value = false;
						compData.UseBeep = false;
						if (pathLabel != null) pathLabel.text = System.IO.Path.GetFileName(path);
						SaveSettings();
					}
#else
					KarmoToys.Core.Utils.Win32FileBrowser.OpenFilePanelAsync("Select Alarm Sound", "", "Audio Files\0*.mp3;*.wav;*.ogg\0All Files\0*.*\0\0", path => 
					{
						_mainThreadActions.Enqueue(() => 
						{
							if (!string.IsNullOrEmpty(path))
							{
								compData.CustomAlarmPath = path;
								if (beepToggle != null) beepToggle.value = false;
								compData.UseBeep = false;
								if (pathLabel != null) pathLabel.text = System.IO.Path.GetFileName(path);
								SaveSettings();
							}
						});
					});
#endif
				});

				_settingsPanel.Q<Button>("BtnClearSound")?.RegisterCallback<ClickEvent>(evt =>
				{
					compData.CustomAlarmPath = "";
					if (pathLabel != null) pathLabel.text = "Default Beep/Clip";
					SaveSettings();
				});

				_settingsPanel.Q<Button>("BtnPreviewSound")?.RegisterCallback<ClickEvent>(evt => _timeModule.PlayAlarm(compData));

				Slider hudSlider = _settingsPanel.Q<Slider>("HudHeightSlider");
				if (hudSlider != null)
				{
					hudSlider.value = _hudOffset;
					hudSlider.RegisterValueChangedCallback(evt => { _hudOffset = evt.newValue; SaveSettings(); });
				}
			}
		}

		private void UpdateTabDisplay()
		{
			if (_avatarTabContent != null) _avatarTabContent.style.display = (_currentTab == SettingsTab.Avatar) ? DisplayStyle.Flex : DisplayStyle.None;
			if (_timeTabContent != null) _timeTabContent.style.display = (_currentTab == SettingsTab.Time) ? DisplayStyle.Flex : DisplayStyle.None;
			if (_keyboardTabContent != null) _keyboardTabContent.style.display = (_currentTab == SettingsTab.Keyboard) ? DisplayStyle.Flex : DisplayStyle.None;
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
			// Refresh if either Time or Keyboard Tab is active
			if (_currentTab != SettingsTab.Time && _currentTab != SettingsTab.Keyboard) return;
			if (_timeModule == null) return;
			if (_settingsPanel == null) return;

			// 1. Update Stopwatch Text
			if (_lblStopwatch != null)
			{
				float t = _timeModule.GetStopwatchTime();
				TimeSpan ts = TimeSpan.FromSeconds(t);
				_lblStopwatch.text = string.Format("{0:00}:{1:00}", ts.Minutes, ts.Seconds);
			}

			// 2. Update Pomodoro
			if (_lblPomodoro != null)
			{
				TimeModule.PomodoroData p = _timeModule.GetPomodoro();
				TimeSpan ts = TimeSpan.FromSeconds(p.RemainingTime);
				string phaseName = p.Phase switch
				{
					TimeModule.PomodoroPhase.Work => "Work",
					TimeModule.PomodoroPhase.ShortBreak => "Break",
					TimeModule.PomodoroPhase.LongBreak => "Long Break",
					_ => "Idle"
				};
				_lblPomodoro.text = $"{ts.Minutes:00}:{ts.Seconds:00}";

				Label cyclesLabel = _settingsPanel.Q<Label>("PomodoroCycles");
				if (cyclesLabel != null) cyclesLabel.text = $"Phase: {phaseName} | Cycles: {p.CompletedCycles}";
			}

			// 2.5 Update Keyboard Stats
			if (_lblKeyboardStats != null)
			{
				KarmoToys.Common.Data.KeyboardStatistics stats = KarmoToys.Main.KarmoToysApp.Instance?.Data?.KeyboardStats;
				if (stats != null)
				{
					_lblKeyboardStats.text = $"Total Key Presses: {stats.TotalKeyPresses:N0}";
				}
			}

			Label kbSfxPathLabel = _settingsPanel.Q<Label>("KeyboardSfxPathLabel");
			if (kbSfxPathLabel != null)
			{
				KarmoToys.Common.Data.CompanionData compData = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
				if (compData != null)
				{
					kbSfxPathLabel.text = string.IsNullOrEmpty(compData.KeyboardSfxPath) ? "Default" : System.IO.Path.GetFileName(compData.KeyboardSfxPath);
					kbSfxPathLabel.tooltip = compData.KeyboardSfxPath;
				}
			}

			// 3. Update Timer List
			// Optimizaion: Only rebuild if count changes to avoid button flicker?
			if (_timerListContainer != null)
			{
				List<TimeModule.TimerData> timers = _timeModule.GetTimers();
				int childCount = _timerListContainer.childCount;

				// Check count AND if the row structure is correct (must have 3 children: Label, Reset, Kill)
				bool needsRebuild = childCount != timers.Count;
				if (!needsRebuild && childCount > 0)
				{
					if (_timerListContainer[0].childCount != 3) needsRebuild = true;
				}

				if (needsRebuild)
				{
					_timerListContainer.Clear();
					foreach (TimeModule.TimerData timer in timers)
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

						Button restartBtn = new Button { text = "↺", tooltip = "Restart", style = { width = 20, height = 18, fontSize = 10, marginRight = 2, backgroundColor = new Color(0.2f, 0.4f, 0.2f) } };
						restartBtn.clicked += () =>
						{
							if (_timeModule != null) _timeModule.RestartTimer(timer.Id);
						};
						row.Add(restartBtn);

						row.Add(btnKill);
						_timerListContainer.Add(row);
					}
				}

				// Update Texts
				for (int i = 0; i < timers.Count; i++)
				{
					if (i < _timerListContainer.childCount)
					{
						VisualElement row = _timerListContainer[i];
						Label label = row.Q<Label>();
						TimeModule.TimerData timer = timers[i];
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

			_context.RootUI.Add(toast);

			// Animate
			toast.schedule.Execute(() =>
			{
				_context.RootUI.Remove(toast);
			}).StartingIn(3000);
		}
	}
}
