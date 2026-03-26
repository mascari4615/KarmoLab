using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UIElements;
using KarmoToys.Common.Data;
using KarmoToys.Main;
using KarmoToys.Features.Companion.Data;
using KarmoToys.Features.Companion.UI;
using KarmoToys.Features.Companion.Controllers;

namespace KarmoToys.Features.Companion.Modules
{
	/// <summary>
	/// KeyboardModule: 전역 키보드 후킹 및 오버레이 레이아웃 관리 모듈.
	/// 
	/// [시스템 아키텍처 및 입력 파이프라인]
	/// 안정성과 실시간성을 확보하기 위해 Win32 전역 후킹과 버퍼링 레이어를 사용함.
	/// 1. Input Layer (Win32): WH_KEYBOARD_LL(Low-level) 후킹을 통해 시스템 전체의 키 이벤트를 가로챔.
	/// 2. Buffer Layer (ConcurrentQueue): 후킹 콜백에서 발생하는 입력을 실시간으로 큐에 적재하여 유니티 메인 스레드와의 경합을 방지함.
	/// 3. Processing Layer (Update): 유니티 루프 내에서 입력을 분석하고(ProcessEvents) Modifier 상태를 판정함.
	/// 4. UI Layer (UIToolkit): 분석된 데이터를 바탕으로 동적인 시각적 오버레이를 생성 및 렌더링함(UpdateOverlay).
	/// 
	/// [주요 기술적 구현]
	/// - 수식키 판정: Shift, Ctrl, Alt, Win 키 등을 추적하여 Modifier 조합(Combo) 모드로의 진입/이탈을 관리함.
	/// - 조합 완성: 수식키가 떼어지는(KeyUp) 시점에 현재 활성 조합을 하나의 행(Row)으로 확정하여 히스토리에 기록함.
	/// - 역방향 스택 UI: 최신 입력 행이 하단에 배치되고, 이전 행들은 위로 밀려 올라가는 Bottom-up 레이아웃.
	/// - 독립적 페이드아웃: 각 RowData는 고유 타임스탬프를 가져 개별적으로 투명도가 조절됨.
	/// 
	/// [주의사항]
	/// - 유니티 앱이 포커스를 가졌을 때 Win32 메시지 루프 점유로 인해 입력 누락이 발생할 수 있어, 포커스 시엔 Hybrid Polling을 병행함.
	/// </summary>
	public class KeyboardModule : ICompanionModule
	{
		private struct KeyboardEvent
		{
			public int VkCode;
			public int ScanCode;
			public bool IsDown;
		}

		private struct RowData
		{
			public Label Label;
			public float LastUpdateTime;
		}

		private CompanionContext _context;
		private AudioSource _audioSource;
		private AudioClip _clickClip;
		private AudioClip _customClickClip;
		private string _currentSfxPath;
		
		private VisualElement _overlayContainer;
		private VisualElement _textGroup; // Grouping Combo and RowContainer
		private VisualElement _rowContainer;
		private Label _activeLabel;
		private Label _comboLabel;

		// EKLS (Extensible Keyboard Layout System)
		private KeyboardView _keyboardView;
		private IKeyboardController _keyboardController;
		public event Action<int, bool> OnKeyStateChanged;

		private readonly List<RowData> _historyRows = new List<RowData>();

		// Input Handling
		private readonly ConcurrentQueue<KeyboardEvent> _eventQueue = new ConcurrentQueue<KeyboardEvent>();
		private readonly List<string> _currentRowKeys = new List<string>();
		private readonly HashSet<string> _pressedKeys = new HashSet<string>();
		private readonly HashSet<int> _pressedVkCodes = new HashSet<int>();
		
		private readonly List<string> _activeComboKeys = new List<string>();
		private bool _isInComboMode = false;

		// Repeat Key Counter (Carnac-style: "Back x 5")
		private string _lastSoloKeyName = null;
		private int _repeatCount = 0;

		private float _lastInputTime;
		private const float OverlayHideDelay = 5.0f;
		private const int MaxRows = 50;
		private float _heartbeatTimer;
		private long _callbackRawCount;
		private float _lastScale = 1.0f;
		private KeyboardLayoutType _lastLayoutType = KeyboardLayoutType.ANSI_104;
		private KeyboardLayoutData _currentLayoutData;
		private bool _wasFocused = false;

		// Drag State
		private bool _isEditMode = false;
		private bool _isDragging = false;
		private VisualElement _dragTarget;
		private Vector2 _dragStartPos; // Element local or parent? Parent local.
		private Vector2 _dragStartMouse;

		// Modifier Keys (0x10~0x12, 0x5B~0x5C 및 L/R 버전)
		private readonly HashSet<int> _modifierVkCodes = new HashSet<int> 
		{ 
			0x10, 0x11, 0x12, 0x5B, 0x5C, // Shift, Ctrl, Alt, Win
			0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5 // L/R versions
		};

		// Win32 Hook
		private IntPtr _hookId = IntPtr.Zero;
		private LowLevelKeyboardProc _proc;

		private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
		private static readonly KeyCode[] _allKeyCodes = (KeyCode[])Enum.GetValues(typeof(KeyCode));

		[DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
		private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

		[DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
		[return: MarshalAs(UnmanagedType.Bool)]
		private static extern bool UnhookWindowsHookEx(IntPtr hhk);

		[DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
		private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

		[DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
		private static extern IntPtr GetModuleHandle(string lpModuleName);

		[StructLayout(LayoutKind.Sequential)]
		private struct KBDLLHOOKSTRUCT
		{
			public uint vkCode;
			public uint scanCode;
			public uint flags;
			public uint time;
			public IntPtr dwExtraInfo;
		}

		private const int WH_KEYBOARD_LL = 13;
		private const int WM_KEYDOWN = 0x0100;
		private const int WM_KEYUP = 0x0101;
		private const int WM_SYSKEYDOWN = 0x0104;
		private const int WM_SYSKEYUP = 0x0105;

		public void Initialize(CompanionContext context)
		{
			Debug.Log("[KeyboardModule] Initialize called.");
			_context = context;
			_proc = HookCallback;
			_hookId = SetHook(_proc);

			if (_hookId == IntPtr.Zero)
			{
				int errorCode = Marshal.GetLastWin32Error();
				Debug.LogError($"[KeyboardModule] Failed to set Win32 Keyboard Hook! Error Code: {errorCode}");
			}
			else
			{
				Debug.Log($"[KeyboardModule] Win32 Keyboard Hook established: {_hookId}");
			}

			InitializeUI();
			InitializeAudio();
		}

		private void InitializeUI()
		{
			if (_context.RootUI == null) return;

			_overlayContainer = new VisualElement();
			_overlayContainer.name = "KeyboardOverlay";
			
			// Full Screen Container
			IStyle style = _overlayContainer.style;
			style.position = Position.Absolute;
			style.left = 0; style.top = 0; style.right = 0; style.bottom = 0;
			style.visibility = Visibility.Hidden; // Controlled by UpdateOverlay
			style.pickingMode = PickingMode.Ignore;
			
			// 1. Text Group (Combo + Rows)
			_textGroup = new VisualElement();
			_textGroup.name = "TextGroup";
			_textGroup.style.position = Position.Absolute;
			_textGroup.style.alignItems = Align.Center;
			_textGroup.style.flexDirection = FlexDirection.Column;
			_textGroup.pickingMode = PickingMode.Ignore; 

			// Default Position (Bottom Center approx)
			// Note: We'll apply saved position in SyncPositions or Update
			_textGroup.style.bottom = 100; 
			_textGroup.style.left = Length.Percent(50);
			_textGroup.style.translate = new Translate(Length.Percent(-50), 0, 0);

			_comboLabel = CreateRowLabel("");
			_comboLabel.name = "ComboLabel";
			_comboLabel.style.marginBottom = 10;
			_comboLabel.style.color = new Color(1f, 0.4f, 0.7f); // Pinkish
			_comboLabel.style.display = DisplayStyle.None;
			_textGroup.Add(_comboLabel);

			_rowContainer = new VisualElement();
			_rowContainer.name = "RowContainer";
			_rowContainer.style.alignItems = Align.Center;
			_rowContainer.pickingMode = PickingMode.Ignore;
			_textGroup.Add(_rowContainer);

			_overlayContainer.Add(_textGroup);

			// 2. EKLS Visual Keyboard
			InitializeEKLS();
			if (_keyboardView != null)
			{
				// Default Position
				_keyboardView.style.position = Position.Absolute;
				_keyboardView.style.bottom = 300; // Higher than text
				_keyboardView.style.left = Length.Percent(50);
				_keyboardView.style.translate = new Translate(Length.Percent(-50), 0, 0);
				
				_overlayContainer.Add(_keyboardView);
			}

			_context.RootUI.Add(_overlayContainer);

			// Initial Position Sync
			SyncPositionsFromData();
		}

		private void SyncPositionsFromData()
		{
			CompanionData data = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
			if (data == null) return;

			if (data.TextOverlayPosition != Vector2.zero)
			{
				_textGroup.style.bottom = StyleKeyword.Auto; // Clear bottom
				_textGroup.style.translate = StyleKeyword.None; // Clear center translate
				_textGroup.style.left = data.TextOverlayPosition.x;
				_textGroup.style.top = data.TextOverlayPosition.y;
			}
			
			if (data.KeyboardLayoutPosition != Vector2.zero && _keyboardView != null)
			{
				_keyboardView.style.bottom = StyleKeyword.Auto;
				_keyboardView.style.translate = StyleKeyword.None;
				_keyboardView.style.left = data.KeyboardLayoutPosition.x;
				_keyboardView.style.top = data.KeyboardLayoutPosition.y;
			}
		}

		private void InitializeEKLS()
		{
			CompanionData companion = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
			_lastLayoutType = companion != null ? companion.CurrentLayout : KeyboardLayoutType.ANSI_104;

			LoadLayout(_lastLayoutType);

			_keyboardView = new KeyboardView();
			_keyboardView.Initialize(_currentLayoutData);
			
			// Init Controller
			_keyboardController = new RealtimeInputController(this);
			_keyboardController.Initialize(_keyboardView);

			// Register Drag for KeyboardView
			RegisterDragCallbacks(_keyboardView,
				() => KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion.KeyboardLayoutPosition ?? Vector2.zero,
				(pos) => 
				{
					var data = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
					if (data != null) data.KeyboardLayoutPosition = pos;
				});
				
			// Apply Edit Mode state to new view
			UpdateEditModeVisuals();
		}

		private void PollUnityInput()
		{
			// Poll all known keys
			foreach (KeyCode k in _allKeyCodes)
			{
				// Skip Mouse buttons and None
				// Optimization for common keys: skip range check if needed, but Enum iteration is fast enough usually
				if ((int)k < (int)KeyCode.Backspace) continue; // Skip None(0) to Backspace(7) range roughly

				bool down = Input.GetKeyDown(k);
				bool up = Input.GetKeyUp(k);
				
				if (down || up)
				{
					int vk = KeyboardUtils.TranslateUnityKeyToVkCode(k);
					if (vk > 0)
					{
						_eventQueue.Enqueue(new KeyboardEvent { VkCode = vk, IsDown = down });
					}
				}
			}
		}

		private void LoadLayout(KeyboardLayoutType type)
		{
			switch (type)
			{
				case KeyboardLayoutType.Game_WASD:
					_currentLayoutData = KeyboardLayoutBuilder.CreateGameWasd();
					break;
				case KeyboardLayoutType.MOBA_QWER:
					_currentLayoutData = KeyboardLayoutBuilder.CreateLolMoba();
					break;
				case KeyboardLayoutType.ANSI_104:
				default:
					_currentLayoutData = Resources.Load<KeyboardLayoutData>("KeyboardLayouts/Default");
					if (_currentLayoutData == null) _currentLayoutData = KeyboardLayoutBuilder.CreateDefaultAnsi104();
					break;
			}
		}

		private void InitializeAudio()
		{
			GameObject audioGo = new GameObject("KeyboardAudio");
			_audioSource = audioGo.AddComponent<AudioSource>();
			UnityEngine.Object.DontDestroyOnLoad(audioGo);

			// Procedural Click Sound Generation
			int frequency = 1200;
			int sampleRate = 44100;
			float duration = 0.05f;
			int sampleCount = (int)(sampleRate * duration);
			float[] samples = new float[sampleCount];

			for (int i = 0; i < sampleCount; i++)
			{
				float envelope = 1.0f - ((float)i / sampleCount);
				samples[i] = Mathf.Sin(2 * Mathf.PI * frequency * i / sampleRate) * envelope;
			}

			_clickClip = AudioClip.Create("Click", sampleCount, 1, sampleRate, false);
			_clickClip.SetData(samples, 0);
		}

		/// <summary>
		/// Win32 Low-Level Keyboard Hook 설정.
		/// </summary>
		private IntPtr SetHook(LowLevelKeyboardProc proc)
		{
			IntPtr hModule = GetModuleHandle(null); 
			return SetWindowsHookEx(WH_KEYBOARD_LL, proc, hModule, 0);
		}

		/// <summary>
		/// 훅 콜백: 시스템 이벤트를 KeyboardEvent 구조체에 담아 ConcurrentQueue에 삽입.
		/// </summary>
		private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
		{
			_callbackRawCount++;
			if (nCode >= 0)
			{
				int msg = wParam.ToInt32();
				if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN || msg == WM_KEYUP || msg == WM_SYSKEYUP)
				{
					KBDLLHOOKSTRUCT kbd = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
					_eventQueue.Enqueue(new KeyboardEvent 
					{ 
						VkCode = (int)kbd.vkCode, 
						ScanCode = (int)kbd.scanCode,
						IsDown = (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) 
					});
				}
			}
			return CallNextHookEx(_hookId, nCode, wParam, lParam);
		}

		public void Update()
		{
			HandleFocusReHook();
			
			// Hybrid Input Polling (Focus only)
			if (Application.isFocused)
			{
				PollUnityInput();
			}

			_heartbeatTimer += Time.deltaTime;
			if (_heartbeatTimer > 5.0f)
			{
				_heartbeatTimer = 0f;
				Debug.Log($"[KeyboardModule] Active. RawCalls: {_callbackRawCount}, Queue: {_eventQueue.Count}");
			}

			ProcessEvents();
			UpdateOverlay(); // Uses _textGroup logic inside? We need to update that.
			_keyboardController?.OnUpdate();

			CheckRuntimeSettingsChanges();
		}

		private void HandleFocusReHook()
		{
			// Re-hook on Focus Gain to preempt Unity's internal hooks
			bool isFocused = Application.isFocused;
			if (isFocused && !_wasFocused)
			{
				// Only re-hook if we already had a hook (don't start it if it was stopped)
				if (_hookId != IntPtr.Zero)
				{
					Debug.Log("[KeyboardModule] Application Focused: Re-installing Hook to Ensure Priority");
					UnhookWindowsHookEx(_hookId);
					_hookId = SetHook(_proc);
				}
			}
			_wasFocused = isFocused;
		}

		private void CheckRuntimeSettingsChanges()
		{
			CompanionData companion = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
			if (companion == null) return;

			// Handle Edit Mode Toggle
			if (_isEditMode != companion.KeyboardEditMode)
			{
				UpdateEditModeVisuals();
			}

			// Handle Runtime Scaling
			if (Mathf.Abs(_lastScale - companion.KeyboardScale) > 0.01f)
			{
				float newScale = Mathf.Max(0.2f, companion.KeyboardScale);
				_lastScale = companion.KeyboardScale; // Update tracker
				if (_keyboardView != null)
				{
					_keyboardView.style.scale = new Scale(Vector2.one * newScale);
				}
			}

			// Handle Runtime Layout Switch
			if (_lastLayoutType != companion.CurrentLayout)
			{
				_lastLayoutType = companion.CurrentLayout;
				LoadLayout(_lastLayoutType);
				if (_keyboardView != null)
				{
					_keyboardView.Initialize(_currentLayoutData);
					// Re-apply scale immediately
					_keyboardView.style.scale = new Scale(Vector2.one * _lastScale);
                    // Re-register callbacks logic handled in InitializeEKLS called by CheckRuntimeSettingsChanges? 
                    // No, CheckRuntimeSettingsChanges calls InitializeEKLS? No.
                    // We need to re-init view if layout changes.
                    // Wait, existing code:
                    // if (_lastLayoutType != companion.CurrentLayout) { ... _keyboardView.Initialize(...); }
                    // It does NOT recreate _keyboardView, just reinits data.
                    // So callbacks persist! Good.
				}
			}
		}

		private void ProcessEvents()
		{
			if (KarmoToys.Main.KarmoToysApp.Instance?.Data == null) return;
			KarmoToysData appData = KarmoToys.Main.KarmoToysApp.Instance.Data;
			CompanionData companion = appData.Companion;

			while (_eventQueue.TryDequeue(out KeyboardEvent ev))
			{
				string keyName = KeyboardUtils.GetKeyName(ev.VkCode);
				
				// Notify EKLS Controller
				try 
				{
					OnKeyStateChanged?.Invoke(ev.VkCode, ev.IsDown);
				}
				catch (Exception ex)
				{
					Debug.LogError($"[KeyboardModule] Event Invoke Error: {ex}");
				}

				if (ev.IsDown)
				{
					HandleKeyDown(ev.VkCode, keyName, companion, appData);
				}
				else
				{
					HandleKeyUp(ev.VkCode, keyName, companion);
				}
			}
		}

		private void HandleKeyDown(int vkCode, string keyName, CompanionData companion, KarmoToysData appData)
		{
			if (!_pressedVkCodes.Contains(vkCode))
			{
				_pressedVkCodes.Add(vkCode);
				_pressedKeys.Add(keyName);
			}

			bool isModifier = _modifierVkCodes.Contains(vkCode);
			string displayKeyName = keyName;
			if (isModifier)
			{
				displayKeyName = $"<color=#FF8C00>{keyName}</color>"; // Dark Orange for modifiers
			}

			if (isModifier)
			{
				_isInComboMode = true;
				if (!_activeComboKeys.Contains(keyName)) 
				{
					_activeComboKeys.Add(keyName);
					_lastInputTime = Time.time;
				}
			}
			else
			{
				if (_isInComboMode)
				{
					if (!_activeComboKeys.Contains(keyName)) 
					{
						_activeComboKeys.Add(keyName);
						_lastInputTime = Time.time;
					}
				}
				else
				{
					float timeSinceLast = Time.time - _lastInputTime;
					if (timeSinceLast > companion.KeyboardRowSeparationThreshold && _currentRowKeys.Count > 0)
					{
						MoveCurrentRowToStack();
					}

					// Repeat Key Counter: 같은 키가 연속 입력되면 카운트 증가
					if (keyName == _lastSoloKeyName && _currentRowKeys.Count > 0)
					{
						_repeatCount++;
						string countText = $"<color=#00FFFF>x{_repeatCount}</color>"; // Cyan for count
						_currentRowKeys[_currentRowKeys.Count - 1] = $"{displayKeyName}{countText}";
					}
					else
					{
						_lastSoloKeyName = keyName;
						_repeatCount = 1;
						_currentRowKeys.Add(displayKeyName);
					}
				}
			}

			// SFX and Stats
			if (_currentSfxPath != companion.KeyboardSfxPath) LoadCustomSfx(companion.KeyboardSfxPath);
			_lastInputTime = Time.time;
			if (companion.PlayKeyboardSfx)
			{
				AudioClip clipToPlay = _customClickClip != null ? _customClickClip : _clickClip;
				_audioSource.PlayOneShot(clipToPlay, companion.KeyboardSfxVolume);
			}
			appData.KeyboardStats.RecordKeyPress();
		}

		private void HandleKeyUp(int vkCode, string keyName, CompanionData companion)
		{
			if (_pressedVkCodes.Contains(vkCode))
			{
				_pressedVkCodes.Remove(vkCode);
				_pressedKeys.Remove(keyName);

				bool isModifier = _modifierVkCodes.Contains(vkCode);

				if (isModifier)
				{
					// When a modifier is released, commit the combo/modifier to history
					if (_activeComboKeys.Count > 0)
					{
						float timeSinceLast = Time.time - _lastInputTime;
						if (timeSinceLast > companion.KeyboardRowSeparationThreshold && _currentRowKeys.Count > 0)
						{
							MoveCurrentRowToStack();
						}

						string result;
						if (_activeComboKeys.Count == 1)
						{
							string modKey = _activeComboKeys[0];
							result = $"<color=#FF8C00>{modKey}</color>";
						}
						else
						{
							// Combo display: join them.
							result = string.Join(" + ", _activeComboKeys);
						}

						_currentRowKeys.Add(result);
						_lastSoloKeyName = null; // Modifier combo breaks solo repeat
						_repeatCount = 0;
						
						_activeComboKeys.Clear();
						_isInComboMode = false;
						_lastInputTime = Time.time;
					}
				}
			}
		}

		private void LoadCustomSfx(string path)
		{
			_currentSfxPath = path;
			_customClickClip = null;

			if (string.IsNullOrEmpty(path) || !System.IO.File.Exists(path)) return;

			Debug.Log($"[KeyboardModule] Custom SFX Path detected: {path}");
			KarmoToysApp.Instance.StartCoroutine(LoadAudioCoroutine(path));
		}

		private IEnumerator LoadAudioCoroutine(string path)
		{
			string uri = "file://" + path.Replace("\\", "/");
			AudioType audioType = AudioType.UNKNOWN;

			if (path.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase)) audioType = AudioType.MPEG;
			else if (path.EndsWith(".wav", StringComparison.OrdinalIgnoreCase)) audioType = AudioType.WAV;
			else if (path.EndsWith(".ogg", StringComparison.OrdinalIgnoreCase)) audioType = AudioType.OGGVORBIS;

			using (UnityWebRequest www = UnityWebRequestMultimedia.GetAudioClip(uri, audioType))
			{
				yield return www.SendWebRequest();

				if (www.result == UnityWebRequest.Result.Success)
				{
					_customClickClip = DownloadHandlerAudioClip.GetContent(www);
					Debug.Log($"[KeyboardModule] Custom SFX Loaded successfully: {path}");
				}
				else
				{
					Debug.LogError($"[KeyboardModule] Failed to load custom SFX: {www.error}");
				}
			}
		}

		private void MoveCurrentRowToStack()
		{
			if (_currentRowKeys.Count == 0) return;

			Label historyLabel = CreateRowLabel(string.Join(" ", _currentRowKeys));
			
			// Newest at the bottom: Insert history JUST ABOVE the active label
			int insertIndex = Mathf.Max(0, _rowContainer.childCount - 1);
			_rowContainer.Insert(insertIndex, historyLabel);
			
			// Preserve fade progress: Use the time of the last key of THIS row
			_historyRows.Add(new RowData { Label = historyLabel, LastUpdateTime = _lastInputTime });

			if (_historyRows.Count > MaxRows)
			{
				RowData oldest = _historyRows[0];
				_rowContainer.Remove(oldest.Label);
				_historyRows.RemoveAt(0);
			}

			_currentRowKeys.Clear();
			_lastSoloKeyName = null;
			_repeatCount = 0;
		}

		private Label CreateRowLabel(string text)
		{
			CompanionData data = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
			float fontSize = data != null ? data.KeyboardFontSize : 28f;

			Label label = new Label(text);
			IStyle style = label.style;
			style.color = Color.white;
			style.fontSize = fontSize;
			style.unityFontStyleAndWeight = FontStyle.Bold;
			style.backgroundColor = new Color(0, 0, 0, 0.7f);
			style.paddingLeft = 15;
			style.paddingRight = 15;
			style.paddingTop = 5;
			style.paddingBottom = 5;
			style.marginBottom = 5;
			style.borderTopLeftRadius = 10;
			style.borderTopRightRadius = 10;
			style.borderBottomLeftRadius = 10;
			style.borderBottomRightRadius = 10;
			return label;
		}


		private void UpdateOverlay()
		{
			CompanionData data = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
			if (data == null || (!data.ShowKeyboardOverlay && !_isEditMode)) // If not showing overlay and not in edit mode, hide.
			{
				_overlayContainer.style.visibility = Visibility.Hidden;
				return;
			}

			_overlayContainer.style.visibility = Visibility.Visible;
			_overlayContainer.style.opacity = 1.0f; 

			if (_keyboardView != null)
			{
				// Keep edit mode visibility in mind?
                // If Edit Mode is ON, we might want to force show everything?
                bool showVK = data.ShowVirtualKeyboard || _isEditMode;
				_keyboardView.style.display = showVK ? DisplayStyle.Flex : DisplayStyle.None;
			}
            
            // Text Group Visibility
            if (_isEditMode)
            {
                // In Edit Mode, always show text group so user can find it
                _textGroup.style.display = DisplayStyle.Flex;
                // Maybe add a placeholder label if empty?
                if (_rowContainer.childCount == 0 && _comboLabel.style.display == DisplayStyle.None)
                {
                    // Ensure _activeLabel exists at least
			        if (_activeLabel == null)
			        {
				        _activeLabel = CreateRowLabel("Example Text");
				        _rowContainer.Add(_activeLabel); 
			        }
                    _activeLabel.style.display = DisplayStyle.Flex;
                    _activeLabel.text = "Drag Me";
                    _activeLabel.style.opacity = 1.0f;
                }
            }

			if (_activeLabel == null)
			{
				_activeLabel = CreateRowLabel("");
				_rowContainer.Add(_activeLabel); 
			}

			// Independent Fading for History Rows
			for (int i = _historyRows.Count - 1; i >= 0; i--)
			{
				RowData row = _historyRows[i];
				float elapsed = Time.time - row.LastUpdateTime;
				// In Edit Mode, don't fade out history? Or just let it be.
                // Better to freeze fading in Edit Mode so user can grab it.
                if (_isEditMode) elapsed = 0; // Freeze

				if (elapsed > OverlayHideDelay)
				{
					_rowContainer.Remove(row.Label);
					_historyRows.RemoveAt(i);
				}
				else
				{
					float alpha = Mathf.Clamp01(1.0f - (elapsed / OverlayHideDelay)) * 0.7f;
					row.Label.style.opacity = alpha;
					row.Label.style.fontSize = data.KeyboardFontSize;
				}
			}

			// Active Label
			float activeElapsed = Time.time - _lastInputTime;
            if (_isEditMode) activeElapsed = 0; // Freeze

			if (activeElapsed > OverlayHideDelay && _currentRowKeys.Count > 0)
			{
				_currentRowKeys.Clear();
				_lastSoloKeyName = null;
				_repeatCount = 0;
			}
			
            // Visibility Logic Calculation
            bool showText = (_currentRowKeys.Count > 0 || _historyRows.Count > 0 || _isInComboMode || _isEditMode);
            bool showEKLS = (data.ShowVirtualKeyboard || _isEditMode) && _keyboardView != null;
            
            if (!showText && !showEKLS)
            {
                 _overlayContainer.style.visibility = Visibility.Hidden;
            }
            else
            {
                 _overlayContainer.style.visibility = Visibility.Visible;
            }
            
            // Text Group Opacity/Display
            if (showText)
            {
                // _textGroup.style.display = DisplayStyle.Flex; // Already default
                _activeLabel.style.display = _currentRowKeys.Count > 0 || _isEditMode ? DisplayStyle.Flex : DisplayStyle.None;
                if (_currentRowKeys.Count > 0) _activeLabel.text = string.Join(" ", _currentRowKeys);
                else if (_isEditMode && _activeLabel.text == "") _activeLabel.text = "Drag Me"; 
                
                float activeAlpha = Mathf.Clamp01(1.0f - (activeElapsed / OverlayHideDelay));
                _activeLabel.style.opacity = activeAlpha;
                _activeLabel.style.fontSize = data.KeyboardFontSize;
                
				if (_rowContainer.IndexOf(_activeLabel) != _rowContainer.childCount - 1)
				{
					_activeLabel.BringToFront();
				}
            }
            // If !showText, checking children inside Update loop effectively hides them via opacity or logic above.
            // But if we want to ensure _textGroup is effectively hidden if empty:
            // _textGroup is just a container.

			// Combo Label
			if (_isInComboMode && _activeComboKeys.Count > 1)
			{
				_comboLabel.text = string.Join(" + ", _activeComboKeys);
				_comboLabel.style.display = DisplayStyle.Flex;
				_comboLabel.style.opacity = 1.0f;
				_comboLabel.style.fontSize = data.KeyboardFontSize;
			}
			else
			{
				_comboLabel.style.display = DisplayStyle.None;
			}
		}

		public void OnDestroy()
		{
			if (_hookId != IntPtr.Zero)
			{
				UnhookWindowsHookEx(_hookId);
				_hookId = IntPtr.Zero;
			}

			if (_audioSource != null) GameObject.Destroy(_audioSource.gameObject);
			if (_overlayContainer != null) _overlayContainer.RemoveFromHierarchy();
		}
	}
}
