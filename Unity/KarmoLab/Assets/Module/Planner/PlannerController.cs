using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoLab.Module.Planner
{
	public partial class PlannerController : MonoBehaviour
	{
		[SerializeField] private UIDocument _uiDocument;

		private PlannerData _data;
		private string _savePath;
		private bool _isInitialized = false;
		private DateTime _currentDate = DateTime.Today; // 주간 보기에서 주의 시작일을 나타냄

		[Tooltip("Snap interval in minutes for drag and drop.")]
		[SerializeField] private float _snapInterval = 5f;

		[Tooltip("Vertical scale in pixels per minute.")]
		[SerializeField, Range(0.5f, 5f)] private float _pixelsPerMinute = 0.8f; // 더 많이 보여주기 위해 기본값 축소됨

		[Tooltip("Start day of the week.")]
		[SerializeField] private DayOfWeek _startDayOfWeek = DayOfWeek.Monday;

		// --- UI 참조 ---
		// 헤더
		private Label _headerDate;
		private Label _headerDDay;
		private TextField _headerTargetInput;

		// 탭
		private Button _tabDash, _tabTasks, _tabSched, _tabSecret;
		private VisualElement _viewDash, _viewTasks, _viewSched, _viewSecret;

		// 새로운 헤더
		private Label _headerPersonal, _headerStudy, _headerTeam;
		private Label _statPersonalTitle, _statPersonalValue, _statTeamTitle, _statTeamValue;

		// 대시보드
		private Label _statProgress;
		private TextField _memoInput;
		private TextField _configTargetDate;
		private Button _saveMemoBtn;

		// 작업
		private ScrollView _listPersonal, _listStudy, _listTeam;
		private TextField _inputPersonal, _inputStudy, _inputTeam;
		private Button _btnAddPersonal, _btnAddStudy, _btnAddTeam;

		// 테마
		private Button _btnThemeToggle;
		private bool _isLightTheme = false;
		private VisualElement _root;

		// 일정
		private Button _prevDayBtn, _nextDayBtn;
		private Label _schedDateLabel;
		private Toggle _weekendToggle;
		private VisualElement _timeRuler;

		// 런타임 설정
		private DropdownField _uiStartDay;
		private Slider _uiZoom;
		private IntegerField _uiSnap;
		private DropdownField _tagFilterDropdown;

		// 주간 보기 요소
		private VisualElement _timeAxis;
		private List<VisualElement> _dayColumns = new();

		// 비밀 노트
		private TextField _secProblem, _secWhy, _secSolution;
		private Button _addSecBtn;
		private VisualElement _secList;

		// 팝업 및 편집
		private VisualElement _detailPopup;
		private Label _detailTitle, _detailTime, _detailDesc;
		private Button _detailEditBtn, _detailCloseBtn, _detailDeleteBtn;


		private VisualElement _editOverlay, _editDialog;
		private TextField _editTitleInput, _editDescInput;
		// 태그 UI
		private VisualElement _editTagsContainer;
		private TextField _editTagInputField;
		private List<string> _tempEditTags = new();

		// 시간을 위한 TextField를 시/분 IntegerField로 교체함
		private IntegerField _editStartHour, _editStartMin, _editEndHour, _editEndMin;

		private Button _editSaveBtn, _editCancelBtn, _editDeleteBtn;
		private List<Button> _colorBtns = new();

		private TimeBlock _selectedBlock;
		private int _selectedColorIndex;

		// 드래그 상태
		private enum DragMode { None, Create, Move }
		private DragMode _dragMode = DragMode.None;
		private float _dragStartY;
		private VisualElement _ghostBlock;
		private int _dragColumnIndex = -1; // 현재 호버 중인 열 인덱스

		// 이동 상태
		private TimeBlock _moveSourceBlock;
		private float _moveOffsetMin; // 블록 시작점으로부터의 마우스 오프셋 (부드러운 드래그를 위해)

		private void Start()
		{
			_uiDocument = GetComponent<UIDocument>();
			Initialize();
		}

		private void Update()
		{
			// 실시간 시계
			if (_headerDate != null)
			{
				_headerDate.text = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
			}
		}

		private void Initialize()
		{
			if (_isInitialized) return;

			// 경로 설정
			_savePath = Path.Combine(Application.persistentDataPath, "planner_data.json");
#if UNITY_EDITOR
			_savePath = Path.Combine(Application.dataPath, "../Data/planner_data.json");
			var dir = Path.GetDirectoryName(_savePath);
			if (!Directory.Exists(dir) && !string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
#endif

			if (_uiDocument == null) return;
			var root = _uiDocument.rootVisualElement;
			if (root == null) return;
			_root = root;

			// 요소 조회
			_btnThemeToggle = root.Q<Button>("BtnThemeToggle");
			_headerDate = root.Q<Label>("HeaderDateLabel");
			_headerDDay = root.Q<Label>("HeaderDDayLabel");
			_headerTargetInput = root.Q<TextField>("HeaderTargetInput");

			_tabDash = root.Q<Button>("TabDashboard");
			_tabTasks = root.Q<Button>("TabTasks");
			_tabSched = root.Q<Button>("TabSchedule");
			_tabSecret = root.Q<Button>("TabSecret");

			_viewDash = root.Q("ViewDashboard");
			_viewTasks = root.Q("ViewTasks");
			_viewSched = root.Q("ViewSchedule");
			_viewSecret = root.Q("ViewSecret");

			// 대시보드
			_statProgress = root.Q<Label>("StatProgress");
			_statPersonalTitle = root.Q<Label>("StatPersonalTitle");
			_statPersonalValue = root.Q<Label>("StatPersonalValue");
			_statTeamTitle = root.Q<Label>("StatTeamTitle");
			_statTeamValue = root.Q<Label>("StatTeamValue");

			_memoInput = root.Q<TextField>("MemoInput");
			_configTargetDate = root.Q<TextField>("ConfigTargetDate");
			_saveMemoBtn = root.Q<Button>("SaveMemoBtn");

			// 작업
			_headerPersonal = root.Q<Label>("HeaderPersonal");
			_headerStudy = root.Q<Label>("HeaderStudy");
			_headerTeam = root.Q<Label>("HeaderTeam");

			_listPersonal = root.Q<ScrollView>("ListPersonal");
			_listStudy = root.Q<ScrollView>("ListStudy");
			_listTeam = root.Q<ScrollView>("ListTeam");
			_inputPersonal = root.Q<TextField>("InputPersonal");
			_inputStudy = root.Q<TextField>("InputStudy");
			_inputTeam = root.Q<TextField>("InputTeam");
			_btnAddPersonal = root.Q<Button>("BtnAddPersonal");
			_btnAddStudy = root.Q<Button>("BtnAddStudy");
			_btnAddTeam = root.Q<Button>("BtnAddTeam");

			// 일정
			_prevDayBtn = root.Q<Button>("PrevDayBtn");
			_nextDayBtn = root.Q<Button>("NextDayBtn");
			_schedDateLabel = root.Q<Label>("CurrentDateLabel");
			_weekendToggle = root.Q<Toggle>("WeekendToggle");
			_timeRuler = root.Q("TimeRulerContainer");

			_uiStartDay = root.Q<DropdownField>("StartDayDropdown");
			_uiZoom = root.Q<Slider>("ZoomSlider");
			_uiSnap = root.Q<IntegerField>("SnapIntervalInput");
			_tagFilterDropdown = root.Q<DropdownField>("TagFilterDropdown");

			// 비밀 노트
			_secProblem = root.Q<TextField>("SecretProblem");
			_secWhy = root.Q<TextField>("SecretWhy");
			_secSolution = root.Q<TextField>("SecretSolution");
			_addSecBtn = root.Q<Button>("AddSecretBtn");
			_secList = root.Q("SecretList");

			// 팝업
			_detailPopup = root.Q("DetailPopup");
			_detailTitle = root.Q<Label>("DetailTitle");
			_detailTime = root.Q<Label>("DetailTime");
			_detailDesc = root.Q<Label>("DetailDesc");
			_detailEditBtn = root.Q<Button>("DetailEditBtn");
			_detailCloseBtn = root.Q<Button>("DetailCloseBtn");
			_detailDeleteBtn = root.Q<Button>("DetailDeleteBtn");

			_editOverlay = root.Q("EditDialogOverlay");
			_editDialog = root.Q("EditDialog");

			_editTitleInput = root.Q<TextField>("EditTitleInput");

			_editStartHour = root.Q<IntegerField>("EditStartHour");
			_editStartMin = root.Q<IntegerField>("EditStartMin");
			_editEndHour = root.Q<IntegerField>("EditEndHour");
			_editEndMin = root.Q<IntegerField>("EditEndMin");

			_editDescInput = root.Q<TextField>("EditDescInput");

			_editTagsContainer = root.Q("EditTagsContainer");
			_editTagInputField = root.Q<TextField>("EditTagInputField");
			_editTagInputField.RegisterCallback<KeyDownEvent>(evt =>
			{
				if (evt.keyCode == KeyCode.Return || evt.keyCode == KeyCode.KeypadEnter)
				{
					AddEditTag(_editTagInputField.value);
					_editTagInputField.value = "";
				}
			});

			_editSaveBtn = root.Q<Button>("EditSaveBtn");
			_editCancelBtn = root.Q<Button>("EditCancelBtn");
			_editDeleteBtn = root.Q<Button>("EditDeleteBtn");

			_colorBtns.Clear();
			for (int i = 0; i < 12; i++)
				_colorBtns.Add(root.Q<Button>($"ColorBtn{i}"));

			// 외부 클릭 해제를 위한 루트 리스너
			root.RegisterCallback<PointerDownEvent>(OnRootPointerDown, TrickleDown.TrickleDown);

			// 바인딩
			_detailCloseBtn.clicked += HideDetailPopup;
			_detailEditBtn.clicked += () => ShowEditDialog(_selectedBlock);
			_detailDeleteBtn.clicked += OnDetailDelete;

			_editCancelBtn.clicked += HideEditDialog;
			_editSaveBtn.clicked += OnSaveEdit;
			_editDeleteBtn.clicked += OnDeleteEdit;

			for (int i = 0; i < _colorBtns.Count; i++)
			{
				int idx = i;
				_colorBtns[i].clicked += () => OnColorSelected(idx);
			}

			_tabDash.clicked += () => SelectTab(_tabDash, _viewDash);
			_tabTasks.clicked += () => SelectTab(_tabTasks, _viewTasks);
			_tabSched.clicked += () => SelectTab(_tabSched, _viewSched);
			_tabSecret.clicked += () => SelectTab(_tabSecret, _viewSecret);

			_saveMemoBtn.clicked += SaveMemo;

			_btnAddPersonal.clicked += AddTodoPersonal;
			_btnAddStudy.clicked += AddTodoStudy;
			_btnAddTeam.clicked += AddTodoTeam;

			_prevDayBtn.clicked += OnPrevWeek;
			_nextDayBtn.clicked += OnNextWeek;

			_addSecBtn.clicked += AddSecretNote;
			_btnThemeToggle.clicked += ToggleTheme;

			// 런타임 설정 초기화
			_uiStartDay.choices = Enum.GetNames(typeof(DayOfWeek)).ToList();
			_uiStartDay.value = _startDayOfWeek.ToString();
			_uiStartDay.RegisterValueChangedCallback(evt =>
			{
				if (Enum.TryParse(evt.newValue, out DayOfWeek day))
				{
					_startDayOfWeek = day;
					AdjustCurrentDateToStartOfWeek();
					RefreshSchedule();
				}
			});

			_uiZoom.value = _pixelsPerMinute;
			_uiZoom.RegisterValueChangedCallback(evt =>
			{
				_pixelsPerMinute = evt.newValue;
				RefreshSchedule();
			});

			_uiSnap.value = (int)_snapInterval;
			_uiSnap.RegisterValueChangedCallback(evt =>
			{
				_snapInterval = Mathf.Max(1, evt.newValue);
			});

			_tagFilterDropdown.RegisterValueChangedCallback(evt =>
			{
				RefreshSchedule();
			});

			_weekendToggle.RegisterValueChangedCallback(evt => RefreshSchedule());

			AdjustCurrentDateToStartOfWeek();

			LoadData();
			RefreshAll();

			// 눈금자 한번 생성
			// 드래그 이벤트 등록
			_timeRuler.RegisterCallback<PointerDownEvent>(OnRulerPointerDown);
			_timeRuler.RegisterCallback<PointerMoveEvent>(OnRulerPointerMove);
			_timeRuler.RegisterCallback<PointerUpEvent>(OnRulerPointerUp);
			_timeRuler.RegisterCallback<PointerLeaveEvent>(OnRulerPointerUp);

			BuildTimeRuler();
			InitializeTools(root);
			InitializeTrash(root); // 휴지통 초기화
			InitializeRecurrenceUI(root); // 반복 일정 UI 초기화
			InitializeToast(root); // 토스트 초기화 (Welcome)

			// 기본 탭 (모든 초기화 후 호출)
			SelectTab(_tabDash, _viewDash);

			// Welcome Toast
			ShowToast("집사님, 돌아오신 걸 환영한다냥! 🐾", ToastType.Info);

			_isInitialized = true;
		}

		private void BindTab(Button btn, VisualElement view)
		{
			btn.clicked += () => SelectTab(btn, view);
		}

		private void SelectTab(Button activeBtn, VisualElement activeView)
		{
			_viewDash.style.display = DisplayStyle.None;
			_viewTasks.style.display = DisplayStyle.None;
			_viewSched.style.display = DisplayStyle.None;
			_viewSecret.style.display = DisplayStyle.None;
			_viewTools.style.display = DisplayStyle.None;

			_tabDash.RemoveFromClassList("selected");
			_tabTasks.RemoveFromClassList("selected");
			_tabSched.RemoveFromClassList("selected");
			_tabSecret.RemoveFromClassList("selected");
			_tabTools.RemoveFromClassList("selected");

			activeView.style.display = DisplayStyle.Flex;
			activeBtn.AddToClassList("selected");

			if (activeView == _viewSched) RefreshSchedule();
		}

		private void ToggleTheme()
		{
			if (_root == null) return;
			_isLightTheme = !_isLightTheme;

			if (_isLightTheme)
			{
				_root.AddToClassList("theme-light");
				if (_btnThemeToggle != null) _btnThemeToggle.text = "●"; // 다크 아이콘
			}
			else
			{
				_root.RemoveFromClassList("theme-light");
				if (_btnThemeToggle != null) _btnThemeToggle.text = "○"; // 라이트 아이콘
			}
		}

		private void CleanupTrash()
		{
			if (_data == null || _data.TimeBlocks == null) return;

			long now = DateTime.Now.Ticks;
			long oneDayTicks = TimeSpan.TicksPerDay;

			// 하루(24시간) 지난 삭제된 항목 영구 제거
			int removedCount = _data.TimeBlocks.RemoveAll(b => b.IsDeleted && (now - b.DeletedTicks > oneDayTicks));

			if (removedCount > 0)
			{
				Debug.Log($"[Planner] Cleanup: Permanently deleted {removedCount} trash items.");
				SaveData();
			}
		}
	}
}