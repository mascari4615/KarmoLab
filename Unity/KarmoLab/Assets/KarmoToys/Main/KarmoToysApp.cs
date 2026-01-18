using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Common;
using KarmoToys.Common.Data;

namespace KarmoToys.Main
{
	[AddComponentMenu("KarmoLab/KarmoToysApp")]
	[RequireComponent(typeof(UIDocument))]
	public class KarmoToysApp : MonoBehaviour
	{
		public static KarmoToysApp Instance { get; private set; }
		public static TooltipService Tooltip { get; private set; }
		public static ToastService Toast { get; private set; }

		[field: SerializeField] public KarmoToysSettings Settings { get; private set; }
		public KarmoToysData Data { get; private set; }
		public string SavePath { get; private set; }
		public AppMode Mode { get; private set; }

		private UIDocument _uiDocument;

		private readonly List<IFeature> _features = new();
		private readonly Dictionary<Button, IFeature> _tabMap = new();

		// UI Refs (Global)
		private Label _headerDateLabel;
		private Label _headerDDayLabel;
		private IFeature _currentFeature;

		private void Awake()
		{
			if (Instance == null) Instance = this;
			else Destroy(gameObject);

			// Check execution mode
			string[] args = Environment.GetCommandLineArgs();
			bool hasModeArg = Array.Exists(args, arg => arg == "-mode");
			string modeStr = "";

			if (hasModeArg)
			{
				int modeIndex = Array.IndexOf(args, "-mode") + 1;
				if (modeIndex < args.Length) modeStr = args[modeIndex].ToLower();
			}

			Mode = modeStr == "companion" ? AppMode.Companion : AppMode.Main;

			AppLauncher.CheckSingleInstance(Mode);
		}

		private void Start()
		{
			_uiDocument = GetComponent<UIDocument>();

			// Ensure run in background is active
			Application.runInBackground = true;

			// Window Mode Setup based on App Mode
			if (Mode == AppMode.Companion)
			{
				// Companion Mode: Start Windowed, then we strip borders in WindowTransparencyUtils
				Screen.fullScreenMode = FullScreenMode.Windowed;

#if UNITY_STANDALONE_WIN
				Rect workArea = Features.Companion.WindowTransparencyUtils.GetWorkArea();
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
			SavePath = System.IO.Path.Combine(Application.persistentDataPath, Define.SaveFileName);
#if UNITY_EDITOR
			SavePath = System.IO.Path.Combine(Application.dataPath, Define.EditorDataPath, Define.SaveFileName);
#endif

			// Load Data
			Data = DataService.Load(SavePath);

			Initialize();
		}

		private void Initialize()
		{
			VisualElement root = _uiDocument.rootVisualElement;
			if (root == null) return;

			// 0. Features Auto Addition
			EnsureFeatures();

			if (Mode == AppMode.Companion)
			{
				// In Companion Mode, UI setup is minimal or handled by CompanionFeature
				root.Clear();

				// Ensure root is circular transparent
				root.style.backgroundColor = new StyleColor(Color.clear);

				// 3. Camera Setup
				Camera camera = Camera.main;
				if (camera != null)
				{
					camera.clearFlags = CameraClearFlags.SolidColor;
					camera.backgroundColor = Color.clear; // (0,0,0,0)
					camera.allowHDR = false;

					// CRITICAL: Disable URP Post-Processing on Camera to preserve Alpha
					if (camera.TryGetComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>(out var camData))
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

			foreach (IFeature feature in _features)
			{
				// 각 피처 초기화
				feature.Initialize(root);

				if (Mode != AppMode.Companion)
				{
					// 탭 버튼 바인딩
					if (!string.IsNullOrEmpty(feature.TabButtonName))
					{
						Button btn = root.Q<Button>(feature.TabButtonName);
						if (btn != null)
						{
							_tabMap[btn] = feature;
							btn.clicked += () => SelectTab(btn);
						}
					}
				}
			}

			if (Mode == AppMode.Companion)
			{
				// Companion Mode initialization ends here
				return;
			}

			// 3. 테마 초기화 및 버튼 바인딩
			ApplyTheme();
			Button themeBtn = root.Q<Button>("BtnThemeToggle");
			if (themeBtn != null) themeBtn.clicked += ToggleTheme;

			Button companionBtn = root.Q<Button>("BtnCompanionToggle");
			if (companionBtn != null) companionBtn.clicked += () => ToggleCompanion();

			// 4. 첫 번째 탭 선택 (기본값)
			if (_tabMap.Count > 0)
			{
				// Dictionary의 첫 번째 키를 가져오는 것은 순서가 보장되지 않으므로, Features 순서대로 찾음
				foreach (IFeature feature in _features)
				{
					Button btn = root.Q<Button>(feature.TabButtonName);
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

			// 6. Auto-Launch Companion
			if (Mode == AppMode.Main) ToggleCompanion();

			// 환영 메시지
			Toast.Show("KarmoToys에 오신 것을 환영함! 🎮", ToastType.Info);
		}

		private void UpdateHeaderTime()
		{
			if (_headerDateLabel != null)
			{
				_headerDateLabel.text = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
			}

			if (_headerDDayLabel != null && Data?.Dashboard != null)
			{
				if (DateTime.TryParse(Data.Dashboard.TargetDateString, out System.DateTime target))
				{
					int diff = (target.Date - DateTime.Now.Date).Days;
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
			AppTheme[] themes = (AppTheme[])Enum.GetValues(typeof(AppTheme));
			// current theme string to enum
			if (!Enum.TryParse(Instance.Data.Theme, out AppTheme currentTheme)) currentTheme = AppTheme.Dark;
			int nextIndex = ((int)currentTheme + 1) % themes.Length;
			Instance.Data.Theme = themes[nextIndex].ToString();

			ApplyTheme();
			SaveData();
			Toast.Show($"테마가 {Instance.Data.Theme} 모드로 변경됨! ✨");
		}

		public void ToggleCompanion(string extraArgs = "") => CompanionService.Launch(extraArgs);

		private void ApplyTheme()
		{
			VisualElement root = _uiDocument.rootVisualElement;
			if (root == null) return;

			// Enum에 정의된 모든 테마 클래스 제거 (소문자 기준)
			foreach (string themeName in Enum.GetNames(typeof(AppTheme)))
			{
				root.RemoveFromClassList($"theme-{themeName.ToLower()}");
			}

			// 현재 선택된 테마 클래스 추가
			root.AddToClassList($"theme-{Data.Theme.ToString().ToLower()}");
		}

		private void SelectTab(Button selectedBtn)
		{
			if (!_tabMap.ContainsKey(selectedBtn)) return;

			IFeature targetFeature = _tabMap[selectedBtn];
			if (_currentFeature == targetFeature) return;

			// 1. 모든 탭 비활성화 UI 처리
			foreach (Button btn in _tabMap.Keys)
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
			DataService.Save(SavePath, Data, Data.MaxBackupCount, tag, forceBackup);
		}

		private void OnApplicationQuit() => SaveData(true, "SessionEnd"); // 앱 종료 시 강제 백업 (SessionEnd)

		public void LoadBackup(string backupPath)
		{
			if (DataService.LoadBackup(SavePath, backupPath, Data.MaxBackupCount))
			{
				LoadData();
				Toast.Show("백업 데이터를 성공적으로 불러옴! 🕒✨");
			}
			else
			{
				Toast.Show("백업 데이터 로드 실패. 😿", ToastType.Error);
			}
		}

		public string GetSaveDirectory() =>
			string.IsNullOrEmpty(SavePath) ? Application.persistentDataPath : System.IO.Path.GetDirectoryName(SavePath);

		public void LoadData()
		{
			Data = DataService.Load(SavePath);
			_currentFeature?.OnSelect();
		}

		private void EnsureFeatures()
		{
			if (Mode == AppMode.Companion)
			{
				// Companion Mode: Only CompanionFeature
				Type type = typeof(Features.Companion.CompanionFeature);
				if (GetComponent(type) == null)
				{
					gameObject.AddComponent(type);
				}
			}
			else
			{
				// Main Mode: Standard Features
				Type[] features = new Type[]
				{
					typeof(Features.Dashboard.DashboardFeature),
					typeof(Features.Planner.PlannerFeature),
					typeof(Features.LifeWeekly.LifeWeeklyFeature),
					typeof(Features.ToolBox.ToolBoxFeature),
					typeof(Features.Preferences.PreferencesFeature),
					typeof(KarmoToys.Features.ProjectManager.ProjectManagerFeature)
				};

				foreach (Type type in features)
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
