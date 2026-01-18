using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Common;
using KarmoToys.Common.Data;

namespace KarmoToys.Main
{
	[AddComponentMenu("KarmoLab/KarmoToysApp")]
	public class KarmoToysApp : MonoBehaviour
	{
		[SerializeField] private UIDocument _uiDocument;
		[SerializeField] private KarmoToysSettings _settings;

		public KarmoToysSettings Settings => _settings;
		public static TooltipService Tooltip { get; private set; }

		public static KarmoToysApp Instance { get; private set; }
		public static ToastService Toast { get; private set; }

		public KarmoToysData Data { get; private set; }
		private string _savePath;

		private List<IFeature> _features = new();
		private Dictionary<Button, IFeature> _tabMap = new();
		// UI Refs (Global)
		private Label _headerDateLabel;
		private Label _headerDDayLabel;

		private IFeature _currentFeature;

		public bool IsCompanionMode { get; private set; }

		// Mutex for Single Instance Check (Keep reference to prevent GC)
		private static System.Threading.Mutex _appMutex;

		private void Awake()
		{
			if (Instance == null) Instance = this;
			else Destroy(gameObject);

			// Check execution mode
			var args = System.Environment.GetCommandLineArgs();
			IsCompanionMode = System.Array.Exists(args, arg => arg == "-mode") &&
							  System.Array.Exists(args, arg => arg == "companion");

			CheckSingleInstance();
		}

		private void CheckSingleInstance()
		{
#if !UNITY_EDITOR
			// Single Instance Protection (Mutex)
			// Different mutex per mode allows Main + Companion to run simultaneously
			string mutexName = IsCompanionMode ? "Global\\KarmoLab_Companion" : "Global\\KarmoLab_Main";
			bool createdNew;

			try
			{
				_appMutex = new System.Threading.Mutex(true, mutexName, out createdNew);
			}
			catch (System.Exception ex)
			{
				Debug.LogError($"[KarmoToysApp] Mutex creation failed: {ex}");
				createdNew = true; // Fallback? Or fail safe? Let's assume fail safe.
			}

			if (!createdNew)
			{
				Debug.LogError($"[KarmoToysApp] Instance already running for mode: {(IsCompanionMode ? "Companion" : "Main")}. Quitting.");
				Application.Quit();
			}
#endif
		}

		private void Start()
		{
			if (_uiDocument == null) _uiDocument = GetComponent<UIDocument>();

			// Ensure run in background is active
			Application.runInBackground = true;

			// Window Mode Setup based on App Mode
			if (IsCompanionMode)
			{
				// Companion Mode: Start Windowed, then we strip borders in WindowTransparencyUtils
				Screen.fullScreenMode = FullScreenMode.Windowed;

#if UNITY_STANDALONE_WIN
				Rect workArea = KarmoToys.Features.Companion.WindowTransparencyUtils.GetWorkArea();
				int width = (int)workArea.width;
				int height = (int)workArea.height;
#else
				int width = Display.main.systemWidth;
				int height = Display.main.systemHeight;
#endif
				Screen.SetResolution(width, height, FullScreenMode.Windowed);
				Debug.Log($"[KarmoToysApp] Companion Mode: Set Resolution to {width}x{height} (WorkArea)");
			}
			else
			{
				// Main Mode: Windowed (Standard)
				Screen.fullScreenMode = FullScreenMode.Windowed;
				Screen.SetResolution(1920, 1080, FullScreenMode.Windowed);
			}

			// Path Setup
			_savePath = System.IO.Path.Combine(Application.persistentDataPath, Define.SaveFileName);
#if UNITY_EDITOR
			_savePath = System.IO.Path.Combine(Application.dataPath, Define.EditorDataPath, Define.SaveFileName);
#endif

			// Load Data
			Data = DataService.Load(_savePath);

			Initialize();
		}

		private void Initialize()
		{
			var root = _uiDocument.rootVisualElement;
			if (root == null) return;

			// 0. Features Auto Addition
			EnsureFeatures();

			if (IsCompanionMode)
			{
				// In Companion Mode, UI setup is minimal or handled by CompanionFeature
				root.Clear();

				// Ensure root is circular transparent
				root.style.backgroundColor = new StyleColor(Color.clear);

				// 3. Camera Setup
				var camera = Camera.main;
				if (camera != null)
				{
					camera.clearFlags = CameraClearFlags.SolidColor;
					camera.backgroundColor = Color.clear; // (0,0,0,0)
					camera.allowHDR = false;

					// CRITICAL: Disable URP Post-Processing on Camera to preserve Alpha
					var camData = camera.GetComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>();
					if (camData != null)
					{
						camData.renderPostProcessing = false;
					}
				}
			}
			else
			{
				// 0.5. Session Start Backup
				SaveData(true, "SessionStart");
			}

			// 1. 공통 서비스 초기화
			Toast = new ToastService(root.Q("ToastContainer"));
			Tooltip = new TooltipService(root);

			// 2. 피처 검색 및 초기화
			_features.Clear();
			_features.AddRange(GetComponentsInChildren<IFeature>());

			foreach (var feature in _features)
			{
				// 각 피처 초기화
				feature.Initialize(root);

				if (!IsCompanionMode)
				{
					// 탭 버튼 바인딩
					if (!string.IsNullOrEmpty(feature.TabButtonName))
					{
						var btn = root.Q<Button>(feature.TabButtonName);
						if (btn != null)
						{
							_tabMap[btn] = feature;
							btn.clicked += () => SelectTab(btn);
						}
					}
				}
			}

			if (IsCompanionMode)
			{
				// Companion Mode initialization ends here
				return;
			}

			// 3. 테마 초기화 및 버튼 바인딩
			ApplyTheme();
			var themeBtn = root.Q<Button>("BtnThemeToggle");
			if (themeBtn != null) themeBtn.clicked += ToggleTheme;

			// 4. 첫 번째 탭 선택 (기본값)
			if (_tabMap.Count > 0)
			{
				// Dictionary의 첫 번째 키를 가져오는 것은 순서가 보장되지 않으므로, Features 순서대로 찾음
				foreach (var feature in _features)
				{
					var btn = root.Q<Button>(feature.TabButtonName);
					if (btn != null && _tabMap.ContainsKey(btn))
					{
						SelectTab(btn);
						break;
					}
				}
			}

			// 5. 헤더 시간 정보 초기화 및 실시간 업데이트 등록
			_headerDateLabel = root.Q<Label>("HeaderDateLabel");
			_headerDDayLabel = root.Q<Label>("HeaderDDayLabel");
			root.schedule.Execute(UpdateHeaderTime).Every(1000);
			UpdateHeaderTime();

			// 환영 메시지
			Toast.Show("KarmoToys에 오신 것을 환영함! 🎮", ToastType.Info);
		}

		private void UpdateHeaderTime()
		{
			if (_headerDateLabel != null)
			{
				_headerDateLabel.text = System.DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
			}

			if (_headerDDayLabel != null && Data?.Planner != null)
			{
				if (System.DateTime.TryParse(Data.Planner.TargetDateString, out System.DateTime target))
				{
					var diff = (target.Date - System.DateTime.Now.Date).Days;
					_headerDDayLabel.text = $"D{diff:+#;-#;0}";
				}
				else
				{
					_headerDDayLabel.text = "D-???";
				}
			}
		}

		private void ToggleTheme()
		{
			var themes = (AppTheme[])System.Enum.GetValues(typeof(AppTheme));
			int nextIndex = ((int)Instance.Data.Theme + 1) % themes.Length;
			Instance.Data.Theme = themes[nextIndex];

			ApplyTheme();
			SaveData();
			Toast.Show($"테마가 {Instance.Data.Theme} 모드로 변경됨! ✨");
		}

		private void ApplyTheme()
		{
			var root = _uiDocument.rootVisualElement;
			if (root == null) return;

			// Enum에 정의된 모든 테마 클래스 제거 (소문자 기준)
			foreach (var themeName in System.Enum.GetNames(typeof(AppTheme)))
			{
				root.RemoveFromClassList($"theme-{themeName.ToLower()}");
			}

			// 현재 선택된 테마 클래스 추가
			root.AddToClassList($"theme-{Data.Theme.ToString().ToLower()}");
		}

		private void SelectTab(Button selectedBtn)
		{
			if (!_tabMap.ContainsKey(selectedBtn)) return;

			var targetFeature = _tabMap[selectedBtn];
			if (_currentFeature == targetFeature) return;

			// 1. 모든 탭 비활성화 UI 처리
			foreach (var btn in _tabMap.Keys)
			{
				btn.RemoveFromClassList("selected");
				_tabMap[btn].OnDeselect();
			}

			// 2. 선택된 탭 활성화
			selectedBtn.AddToClassList("selected");
			targetFeature.OnSelect();
			_currentFeature = targetFeature;
		}

		public void SaveData(bool forceBackup = false, string tagOverride = "")
		{
			if (Data == null) return;

			string tag = string.IsNullOrEmpty(tagOverride) ? $"v{Application.version}" : tagOverride;

			// 앱 버전 정보를 백업 태그로 전달 (기본 백업 로직은 DataService 내부에서 AutoBackup 설정에 따름)
			DataService.Save(_savePath, Data, Data.MaxBackupCount, tag, forceBackup);
		}

		private void OnApplicationQuit()
		{
			// 앱 종료 시 강제 백업 (SessionEnd)
			SaveData(true, "SessionEnd");
		}

		public void LoadBackup(string backupPath)
		{
			if (DataService.LoadBackup(_savePath, backupPath, Data.MaxBackupCount))
			{
				LoadData();
				Toast.Show("백업 데이터를 성공적으로 불러옴! 🕒✨");
			}
			else
			{
				Toast.Show("백업 데이터 로드 실패. 😿", ToastType.Error);
			}
		}

		public string GetSaveDirectory()
		{
			if (string.IsNullOrEmpty(_savePath)) return Application.persistentDataPath;
			return System.IO.Path.GetDirectoryName(_savePath);
		}

		public string GetSavePath()
		{
			return _savePath;
		}

		public void LoadData()
		{
			Data = DataService.Load(_savePath);
			if (Data != null) Data.MigrateLegacyData();
			if (_currentFeature != null) _currentFeature.OnSelect();
		}

		private void EnsureFeatures()
		{
			if (IsCompanionMode)
			{
				// Companion Mode: Only CompanionFeature
				var type = typeof(Features.Companion.CompanionFeature);
				if (GetComponent(type) == null)
				{
					gameObject.AddComponent(type);
				}
			}
			else
			{
				// Main Mode: Standard Features
				var features = new System.Type[]
				{
					typeof(Features.Dashboard.DashboardFeature),
					typeof(Features.Planner.PlannerFeature),
					typeof(KarmoToys.Features.LifeWeekly.LifeWeeklyFeature),
					typeof(Features.QuestBoard.QuestBoardFeature),
					typeof(Features.Note.NoteFeature),
					typeof(Features.ToolBox.ToolBoxFeature),
					typeof(Features.Preferences.PreferencesFeature)
				};

				foreach (var type in features)
				{
					if (GetComponent(type) == null)
					{
						gameObject.AddComponent(type);
						Debug.Log($"[KarmoToys] Auto-added missing feature: {type.Name}");
					}
				}
			}
		}
	}
}
