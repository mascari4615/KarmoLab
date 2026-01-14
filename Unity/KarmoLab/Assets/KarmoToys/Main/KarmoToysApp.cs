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

		private void Awake()
		{
			if (Instance == null) Instance = this;
			else Destroy(gameObject);
		}

		private void Start()
		{
			if (_uiDocument == null) _uiDocument = GetComponent<UIDocument>();

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

				// 탭 버튼 바인딩
				if (!string.IsNullOrEmpty(feature.TabButtonName))
				{
					var btn = root.Q<Button>(feature.TabButtonName);
					if (btn != null)
					{
						_tabMap[btn] = feature;
						btn.clicked += () => SelectTab(btn);
					}
					else
					{
						Debug.LogWarning($"[KarmoToys] Tab Button '{feature.TabButtonName}' not found for feature '{feature.FeatureName}'");
					}
				}
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
			Toast.Show("KarmoToys에 오신 것을 환영한다냥! 🎮", ToastType.Info);
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
			Toast.Show($"테마가 {Instance.Data.Theme} 모드로 바뀌었다냥! ✨");
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

		public void SaveData()
		{
			DataService.Save(_savePath, Data);
		}

		public string GetSaveDirectory()
		{
			if (string.IsNullOrEmpty(_savePath)) return Application.persistentDataPath;
			return System.IO.Path.GetDirectoryName(_savePath);
		}

		public void LoadData()
		{
			Data = DataService.Load(_savePath);
			if (_currentFeature != null) _currentFeature.OnSelect();
		}

		private void EnsureFeatures()
		{
			// List of known features to auto-add
			var features = new System.Type[]
			{
				typeof(Features.Dashboard.DashboardFeature),
				typeof(Features.Planner.PlannerFeature),
				typeof(KarmoToys.Features.LifeWeekly.LifeWeeklyFeature),
				typeof(Features.QuestBoard.QuestBoardFeature),
				typeof(Features.Note.NoteFeature),
				typeof(Features.ToolBox.ToolBoxFeature)
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
