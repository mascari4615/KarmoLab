using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections;
using UnityEngine;
using UnityEngine.UIElements;
using UnityEngine.Networking;
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
	/// [구현 세부 사항]
	/// 1. 전역 키보드 후킹 (Win32 API): WH_KEYBOARD_LL(13) 사용. kernel32/user32 P/Invoke 연동.
	/// 2. 입력 처리 파이프라인: Win32 Hook -> ConcurrentQueue -> ProcessEvents(Update) -> UIToolkit(UpdateOverlay).
	/// 3. 조합키(Modifier) 로직: Shift, Ctrl, Alt, Win 키 눌림 상태 관리 및 KeyUp 시점에 조합 완성 기록.
	/// 4. UI 레이아웃: 역방향 전개(최신 항목 하단), 개별 페이드아웃 시스템, 폰트 크기 커스터마이징 지원.
	/// 
	/// [주의사항]
	/// - 유니티 앱이 포커스를 가졌을 때 Win32 메시지 루프 점유로 인해 입력 누락이 발생할 수 있음.
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
			
			IStyle style = _overlayContainer.style;
			style.position = Position.Absolute;
			style.bottom = 100;
			style.left = 0;
			style.right = 0;
			style.visibility = Visibility.Hidden;
			style.alignItems = Align.Center;
			style.flexDirection = FlexDirection.Column; // Combo top, Rows bottom
			_overlayContainer.pickingMode = PickingMode.Ignore;

			// 1. Combo Label at the TOP
			_comboLabel = CreateRowLabel("");
			_comboLabel.name = "ComboLabel";
			_comboLabel.style.marginBottom = 10;
			_comboLabel.style.color = new Color(1f, 0.4f, 0.7f); // Pinkish
			_comboLabel.style.display = DisplayStyle.None;
			_overlayContainer.Add(_comboLabel);

			// 2. Row History below combo
			_rowContainer = new VisualElement();
			_rowContainer.name = "RowContainer";
			_rowContainer.style.alignItems = Align.Center;
			_rowContainer.pickingMode = PickingMode.Ignore;
			_overlayContainer.Add(_rowContainer);



			// 3. EKLS Visual Keyboard (Hidden by default until toggled)
			InitializeEKLS();
			if (_keyboardView != null)
			{
				_overlayContainer.Add(_keyboardView);
			}

            // 4. Hybrid Input (IMGUI Hook)
            // When application is focused, Unity consumes input before LL Hook sees it.
            // So we capture input directly from Unity via IMGUI (OnGUI).
            /* IMGUI Disabled - Using Update Polling instead
            var imguiContainer = new IMGUIContainer(OnGUIHandler);
            // Make it invisible but active
            imguiContainer.style.position = Position.Absolute;
            imguiContainer.style.width = 10;
            imguiContainer.style.height = 10;
            imguiContainer.style.opacity = 0;
            imguiContainer.pickingMode = PickingMode.Ignore;
            _overlayContainer.Add(imguiContainer);
            */

			_context.RootUI.Add(_overlayContainer);
		}

        /*
        private void OnGUIHandler()
        {
            // ... (original code removed) ...
        }
        */

		private void InitializeEKLS()
		{
			var companion = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
			_lastLayoutType = companion != null ? companion.CurrentLayout : KeyboardLayoutType.ANSI_104;

			LoadLayout(_lastLayoutType);

			_keyboardView = new KeyboardView();
			_keyboardView.Initialize(_currentLayoutData);
			
			// Init Controller
			_keyboardController = new RealtimeInputController(this);
			_keyboardController.Initialize(_keyboardView);
		}

        private int TranslateUnityKeyToVkCode(KeyCode key)
        {
            // Basic mapping for common keys
            int k = (int)key;
            if (k >= (int)KeyCode.A && k <= (int)KeyCode.Z) return k - 32; // 'a'(97) -> 'A'(65)
            if (k >= (int)KeyCode.Alpha0 && k <= (int)KeyCode.Alpha9) return k; // 0-9 match
            if (k >= (int)KeyCode.F1 && k <= (int)KeyCode.F12) return 112 + (k - (int)KeyCode.F1); // F1(282) -> 112

            switch (key)
            {
                case KeyCode.Backspace: return 0x08;
                case KeyCode.Tab: return 0x09;
                case KeyCode.Return: case KeyCode.KeypadEnter: return 0x0D;
                case KeyCode.LeftShift: case KeyCode.RightShift: return 0x10; // Simple mapping
                case KeyCode.LeftControl: case KeyCode.RightControl: return 0x11;
                case KeyCode.LeftAlt: case KeyCode.RightAlt: return 0x12;
                case KeyCode.CapsLock: return 0x14;
                case KeyCode.Escape: return 0x1B;
                case KeyCode.Space: return 0x20;
                case KeyCode.PageUp: return 0x21;
                case KeyCode.PageDown: return 0x22;
                case KeyCode.End: return 0x23;
                case KeyCode.Home: return 0x24;
                case KeyCode.LeftArrow: return 0x25;
                case KeyCode.UpArrow: return 0x26;
                case KeyCode.RightArrow: return 0x27;
                case KeyCode.DownArrow: return 0x28;
                case KeyCode.Insert: return 0x2D;
                case KeyCode.Delete: return 0x2E;
                case KeyCode.Semicolon: return 186;
                case KeyCode.Equals: return 187; // +
                case KeyCode.Comma: return 188;
                case KeyCode.Minus: return 189;
                case KeyCode.Period: return 190;
                case KeyCode.Slash: return 191;
                case KeyCode.BackQuote: return 192; // ~
                case KeyCode.LeftBracket: return 219;
                case KeyCode.Backslash: return 220;
                case KeyCode.RightBracket: return 221;
                case KeyCode.Quote: return 222;
            }
            return 0;
        }

        private void PollUnityInput()
        {
            // Optimize: check generic anyKey first
            if (Input.anyKey || Input.anyKeyDown)
            {
                foreach (KeyCode k in _allKeyCodes)
                {
                    // Skip Mouse buttons and None
                    if ((int)k < (int)KeyCode.Space && k != KeyCode.Backspace && k != KeyCode.Tab && k != KeyCode.Return && k != KeyCode.Escape) continue; // Optimization for common keys

                    bool down = Input.GetKeyDown(k);
                    bool up = Input.GetKeyUp(k);
                    
                    if (down || up)
                    {
                        int vk = TranslateUnityKeyToVkCode(k);
                        if (vk > 0)
                        {
                            _eventQueue.Enqueue(new KeyboardEvent { VkCode = vk, IsDown = down });
                        }
                    }
                }
            }
        }

		private string GetKeyName(int vkCode, int scanCode)
		{
			switch (vkCode)
			{
				case 0x08: return "Back";
				case 0x09: return "Tab";
				case 0x0D: return "Enter";
				case 0x10: case 0xA0: case 0xA1: return "Shift";
				case 0x11: case 0xA2: case 0xA3: return "Ctrl";
				case 0x12: case 0xA4: case 0xA5: return "Alt";
				case 0x14: return "Caps";
				case 0x15: return "한/영";
				case 0x19: return "한자";
				case 0x1B: return "Esc";
				case 0x20: return "Space";
				case 0x2E: return "Del";
                case 0x21: return "PgUp";
				case 0x22: return "PgDn";
				case 0x23: return "End";
				case 0x24: return "Home";
				case 0x25: return "←";
				case 0x26: return "↑";
				case 0x27: return "→";
				case 0x28: return "↓";
				case 0x2C: return "PrtSc";
				case 0x2D: return "Ins";
				case 0x5B: case 0x5C: return "Win";
                // Symbols
				case 186: return ";";
				case 187: return "=";
				case 188: return ",";
				case 189: return "-";
				case 190: return ".";
				case 191: return "/";
				case 192: return "`";
				case 219: return "[";
				case 220: return "\\";
				case 221: return "]";
				case 222: return "'";
                
                // F-Keys
                case int n when (n >= 112 && n <= 123): return "F" + (n - 111);
			}
            // Fallback for letters/numbers
            if ((vkCode >= 65 && vkCode <= 90) || (vkCode >= 48 && vkCode <= 57))
            {
                return ((char)vkCode).ToString();
            }
			return "K" + vkCode;
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

            // Hybrid Input Polling (Focus only)
            if (isFocused)
            {
                PollUnityInput();
            }

			_heartbeatTimer += Time.deltaTime;
			if (_heartbeatTimer > 5.0f)
			{
				_heartbeatTimer = 0f;
				CompanionData data = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
				Debug.Log($"[KeyboardModule] Active. RawCalls: {_callbackRawCount}, Queue: {_eventQueue.Count}");
			}

			ProcessEvents();
			UpdateOverlay();
			_keyboardController?.OnUpdate();

			// Handle Runtime Scaling
			var companion = KarmoToys.Main.KarmoToysApp.Instance?.Data?.Companion;
			if (companion != null && Mathf.Abs(_lastScale - companion.KeyboardScale) > 0.01f)
			{
				float newScale = Mathf.Max(0.2f, companion.KeyboardScale);
				_lastScale = companion.KeyboardScale; // Update tracker
				if (_keyboardView != null)
				{
					_keyboardView.style.scale = new Scale(Vector2.one * newScale);
				}
			}

			// Handle Runtime Layout Switch
			if (companion != null && _lastLayoutType != companion.CurrentLayout)
			{
				_lastLayoutType = companion.CurrentLayout;
				LoadLayout(_lastLayoutType);
				if (_keyboardView != null)
				{
					_keyboardView.Initialize(_currentLayoutData);
					// Re-apply scale immediately
					_keyboardView.style.scale = new Scale(Vector2.one * _lastScale);
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
				string keyName = GetKeyName(ev.VkCode, ev.ScanCode);
				
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
					if (!_pressedVkCodes.Contains(ev.VkCode))
					{
						_pressedVkCodes.Add(ev.VkCode);
						_pressedKeys.Add(keyName);
					}

					bool isModifier = _modifierVkCodes.Contains(ev.VkCode);
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
				else
				{
					// Key Up
					if (_pressedVkCodes.Contains(ev.VkCode))
					{
						_pressedVkCodes.Remove(ev.VkCode);
						_pressedKeys.Remove(keyName);

						bool isModifier = _modifierVkCodes.Contains(ev.VkCode);

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
									// Combo display
									List<string> styledKeys = new List<string>();
									foreach(var k in _activeComboKeys)
									{
										// Since we store pure names in _activeComboKeys, we need to style them here if needed
										// But let's keep it simple or style modifier parts
										// Actually typically combos are like Ctrl + C.
										// Let's just join them.
										styledKeys.Add(k);
									}
									result = string.Join(" + ", styledKeys);
								}

								_currentRowKeys.Add(result);
								_lastSoloKeyName = null; // Modifier combo breaks solo repeat
								_repeatCount = 0;
								
								// Force new row for next input
								// MoveCurrentRowToStack(); // Optional: commit immediately? 
								// Carnac usually keeps it in current row until timeout
								_activeComboKeys.Clear();
								_isInComboMode = false;
								_lastInputTime = Time.time;
							}
						}
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
			if (data == null || !data.ShowKeyboardOverlay)
			{
				_overlayContainer.style.visibility = Visibility.Hidden;
				return;
			}

			_overlayContainer.style.visibility = Visibility.Visible;
			_overlayContainer.style.opacity = 1.0f; 

			if (_keyboardView != null)
			{
				_keyboardView.style.display = data.ShowVirtualKeyboard ? DisplayStyle.Flex : DisplayStyle.None;
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
			if (activeElapsed > OverlayHideDelay && _currentRowKeys.Count > 0)
			{
				MoveCurrentRowToStack();
			}
			
			if (_currentRowKeys.Count == 0 && _historyRows.Count == 0 && !_isInComboMode)
			{
				_overlayContainer.style.visibility = Visibility.Hidden;
			}
			else
			{
				_activeLabel.style.display = _currentRowKeys.Count > 0 ? DisplayStyle.Flex : DisplayStyle.None;
				_activeLabel.text = string.Join(" ", _currentRowKeys);
				float activeAlpha = Mathf.Clamp01(1.0f - (activeElapsed / OverlayHideDelay));
				_activeLabel.style.opacity = activeAlpha;
				_activeLabel.style.fontSize = data.KeyboardFontSize;
				
				// Ensure active label is ALWAYS the last child
				if (_rowContainer.IndexOf(_activeLabel) != _rowContainer.childCount - 1)
				{
					_activeLabel.BringToFront();
				}
			}

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
