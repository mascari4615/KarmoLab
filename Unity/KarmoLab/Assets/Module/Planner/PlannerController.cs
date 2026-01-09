using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoLab.Module.Planner
{
    [ExecuteAlways]
    public partial class PlannerController : MonoBehaviour
    {
        [SerializeField] private UIDocument _uiDocument;
        
        private PlannerData _data;
        private string _savePath;
        private bool _isInitialized = false;
        private DateTime _currentDate = DateTime.Today; // Represents the Start of the Week in Week View
        
        [Tooltip("Snap interval in minutes for drag and drop.")]
        [SerializeField] private float _snapInterval = 5f;

        [Tooltip("Vertical scale in pixels per minute.")]
        [SerializeField, Range(0.5f, 5f)] private float _pixelsPerMinute = 1.0f;

        [Tooltip("Start day of the week.")]
        [SerializeField] private DayOfWeek _startDayOfWeek = DayOfWeek.Monday;

        // --- UI References ---
        // Headers
        private Label _headerDate;
        private Label _headerDDay;
        private TextField _headerTargetInput;
        
        // Tabs
        private Button _tabDash, _tabTasks, _tabSched, _tabSecret;
        private VisualElement _viewDash, _viewTasks, _viewSched, _viewSecret;

        // New Headers
        private Label _headerPersonal, _headerStudy, _headerTeam;
        private Label _statPersonalTitle, _statPersonalValue, _statTeamTitle, _statTeamValue;

        // Dashboard
        private Label _statProgress;
        private TextField _memoInput;
        private TextField _configTargetDate;
        private Button _saveMemoBtn;

        // Tasks
        private ScrollView _listPersonal, _listStudy, _listTeam;
        private TextField _inputPersonal, _inputStudy, _inputTeam;
        private Button _btnAddPersonal, _btnAddStudy, _btnAddTeam;

        // Schedule
        private Button _prevDayBtn, _nextDayBtn;
        private Label _schedDateLabel;
        private VisualElement _timeRuler;
        
        // Runtime Settings
        private DropdownField _uiStartDay;
        private Slider _uiZoom;
        private IntegerField _uiSnap;
        private DropdownField _tagFilterDropdown;

        // Week View Elements
        private VisualElement _timeAxis;
        private List<VisualElement> _dayColumns = new();

        // Secret
        private TextField _secProblem, _secWhy, _secSolution;
        private Button _addSecBtn;
        private VisualElement _secList;
        
        // Popup & Edit
        private VisualElement _detailPopup;
        private Label _detailTitle, _detailTime, _detailDesc;
        private Button _detailEditBtn, _detailCloseBtn;

        private VisualElement _editOverlay, _editDialog;
        private TextField _editTitleInput, _editDescInput;
        // Tag UI
        private VisualElement _editTagsContainer;
        private TextField _editTagInputField;
        private List<string> _tempEditTags = new();

        // Replaced TextField for time with Hour/Min IntegerFields
        private IntegerField _editStartHour, _editStartMin, _editEndHour, _editEndMin;
        
        private Button _editSaveBtn, _editCancelBtn, _editDeleteBtn;
        private List<Button> _colorBtns = new();
        
        private TimeBlock _selectedBlock;
        private int _selectedColorIndex;

        // Dragging State
        private enum DragMode { None, Create, Move }
        private DragMode _dragMode = DragMode.None;
        private float _dragStartY;
        private VisualElement _ghostBlock;
        private int _dragColumnIndex = -1; // Current column index being hovered
        
        // Move State
        private TimeBlock _moveSourceBlock;
        private float _moveOffsetMin; // Mouse offset from block start (for smoother drag)

        private void OnEnable()
        {
            if (_uiDocument == null) _uiDocument = GetComponent<UIDocument>();
            Initialize();
        }

        private void Start() => Initialize();

        private void Update()
        {
            if (_uiDocument != null && (_tabDash == null || _tabDash.panel == null)) Initialize();
            
            // Real-time Clock
            if (_headerDate != null)
            {
                _headerDate.text = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            }
        }

        private void Initialize()
        {
            if (_isInitialized && _tabDash != null && _tabDash.panel != null) return;

            // Path Setup
            _savePath = Path.Combine(Application.persistentDataPath, "planner_data.json");
            #if UNITY_EDITOR
            _savePath = Path.Combine(Application.dataPath, "../Data/planner_data.json");
            var dir = Path.GetDirectoryName(_savePath);
            if (!Directory.Exists(dir) && !string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            #endif

            if (_uiDocument == null) return;
            var root = _uiDocument.rootVisualElement;
            if (root == null) return;

            // Query Elements
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

            // Dashboard
            _statProgress = root.Q<Label>("StatProgress");
            _statPersonalTitle = root.Q<Label>("StatPersonalTitle");
            _statPersonalValue = root.Q<Label>("StatPersonalValue");
            _statTeamTitle = root.Q<Label>("StatTeamTitle");
            _statTeamValue = root.Q<Label>("StatTeamValue");
            
            _memoInput = root.Q<TextField>("MemoInput");
            _configTargetDate = root.Q<TextField>("ConfigTargetDate");
            _saveMemoBtn = root.Q<Button>("SaveMemoBtn");

            // Tasks
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

            // Schedule
            _prevDayBtn = root.Q<Button>("PrevDayBtn");
            _nextDayBtn = root.Q<Button>("NextDayBtn");
            _schedDateLabel = root.Q<Label>("CurrentDateLabel");
            _timeRuler = root.Q("TimeRulerContainer");
            
            _uiStartDay = root.Q<DropdownField>("StartDayDropdown");
            _uiZoom = root.Q<Slider>("ZoomSlider");
            _uiSnap = root.Q<IntegerField>("SnapIntervalInput");
            _tagFilterDropdown = root.Q<DropdownField>("TagFilterDropdown");

            // Secret
            _secProblem = root.Q<TextField>("SecretProblem");
            _secWhy = root.Q<TextField>("SecretWhy");
            _secSolution = root.Q<TextField>("SecretSolution");
            _addSecBtn = root.Q<Button>("AddSecretBtn");
            _secList = root.Q("SecretList");

            // Popups
            _detailPopup = root.Q("DetailPopup");
            _detailTitle = root.Q<Label>("DetailTitle");
            _detailTime = root.Q<Label>("DetailTime");
            _detailDesc = root.Q<Label>("DetailDesc");
            _detailEditBtn = root.Q<Button>("DetailEditBtn");
            _detailCloseBtn = root.Q<Button>("DetailCloseBtn");

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
            if (_editTagInputField != null)
            {
                _editTagInputField.RegisterCallback<KeyDownEvent>(evt => {
                    if (evt.keyCode == KeyCode.Return || evt.keyCode == KeyCode.KeypadEnter)
                    {
                        AddEditTag(_editTagInputField.value);
                        _editTagInputField.value = "";
                    }
                });
            }
            
            _editSaveBtn = root.Q<Button>("EditSaveBtn");
            _editCancelBtn = root.Q<Button>("EditCancelBtn");
            _editDeleteBtn = root.Q<Button>("EditDeleteBtn");

            _colorBtns.Clear();
            for(int i=0; i<12; i++) _colorBtns.Add(root.Q<Button>($"ColorBtn{i}"));

            // Root Listener for outside click dismissal
            root.RegisterCallback<PointerDownEvent>(OnRootPointerDown, TrickleDown.TrickleDown);

            // Bindings
            if (_detailCloseBtn != null) { _detailCloseBtn.clicked -= HideDetailPopup; _detailCloseBtn.clicked += HideDetailPopup; }
            if (_detailEditBtn != null) { _detailEditBtn.clicked -= () => ShowEditDialog(_selectedBlock); _detailEditBtn.clicked += () => ShowEditDialog(_selectedBlock); }
            
            if (_editCancelBtn != null) { _editCancelBtn.clicked -= HideEditDialog; _editCancelBtn.clicked += HideEditDialog; }
            if (_editSaveBtn != null) { _editSaveBtn.clicked -= OnSaveEdit; _editSaveBtn.clicked += OnSaveEdit; }
            if (_editDeleteBtn != null) { _editDeleteBtn.clicked -= OnDeleteEdit; _editDeleteBtn.clicked += OnDeleteEdit; }

            for(int i=0; i<_colorBtns.Count; i++) {
                int idx = i;
                if(_colorBtns[i] != null) {
                    _colorBtns[i].clicked -= () => OnColorSelected(idx);
                    _colorBtns[i].clicked += () => OnColorSelected(idx);
                }
            }

            if (_tabDash != null) BindTab(_tabDash, _viewDash);
            if (_tabTasks != null) BindTab(_tabTasks, _viewTasks);
            if (_tabSched != null) BindTab(_tabSched, _viewSched);
            if (_tabSecret != null) BindTab(_tabSecret, _viewSecret);

            if (_saveMemoBtn != null) { _saveMemoBtn.clicked -= SaveMemo; _saveMemoBtn.clicked += SaveMemo; }

            if (_btnAddPersonal != null) { _btnAddPersonal.clicked -= AddTodoPersonal; _btnAddPersonal.clicked += AddTodoPersonal; }
            if (_btnAddStudy != null) { _btnAddStudy.clicked -= AddTodoStudy; _btnAddStudy.clicked += AddTodoStudy; }
            if (_btnAddTeam != null) { _btnAddTeam.clicked -= AddTodoTeam; _btnAddTeam.clicked += AddTodoTeam; }

            if (_prevDayBtn != null) { _prevDayBtn.clicked -= OnPrevWeek; _prevDayBtn.clicked += OnPrevWeek; }
            if (_nextDayBtn != null) { _nextDayBtn.clicked -= OnNextWeek; _nextDayBtn.clicked += OnNextWeek; }

            if (_addSecBtn != null) { _addSecBtn.clicked -= AddSecretNote; _addSecBtn.clicked += AddSecretNote; }

            // Runtime Settings Init
            if (_uiStartDay != null)
            {
                _uiStartDay.choices = Enum.GetNames(typeof(DayOfWeek)).ToList();
                _uiStartDay.value = _startDayOfWeek.ToString();
                _uiStartDay.RegisterValueChangedCallback(evt => {
                    if (Enum.TryParse(evt.newValue, out DayOfWeek day)) {
                        _startDayOfWeek = day;
                        AdjustCurrentDateToStartOfWeek();
                        RefreshSchedule();
                    }
                });
            }
            if (_uiZoom != null)
            {
                _uiZoom.value = _pixelsPerMinute;
                _uiZoom.RegisterValueChangedCallback(evt => {
                    _pixelsPerMinute = evt.newValue;
                    RefreshSchedule(); 
                });
            }
            if (_uiSnap != null)
            {
                _uiSnap.value = (int)_snapInterval;
                _uiSnap.RegisterValueChangedCallback(evt => {
                    _snapInterval = Mathf.Max(1, evt.newValue);
                });
            }
            if (_tagFilterDropdown != null)
            {
                _tagFilterDropdown.RegisterValueChangedCallback(evt => {
                    RefreshSchedule();
                });
            }

            AdjustCurrentDateToStartOfWeek();

            LoadData();
            RefreshAll();
            
            // Build ruler once
            if (_timeRuler != null && _viewSched != null) 
            {
                // Register Drag Events
                _timeRuler.RegisterCallback<PointerDownEvent>(OnRulerPointerDown);
                _timeRuler.RegisterCallback<PointerMoveEvent>(OnRulerPointerMove);
                _timeRuler.RegisterCallback<PointerUpEvent>(OnRulerPointerUp);
                _timeRuler.RegisterCallback<PointerLeaveEvent>(OnRulerPointerUp);

                BuildTimeRuler();
                // Default Tab
                SelectTab(_tabDash, _viewDash);
            }

            InitializeTools(root);
            _isInitialized = true;
        }

        private void BindTab(Button btn, VisualElement view)
        {
            btn.clicked -= () => SelectTab(btn, view); 
            btn.clicked += () => SelectTab(btn, view);
        }

        private void SelectTab(Button activeBtn, VisualElement activeView)
        {
            if (_viewDash != null) _viewDash.style.display = DisplayStyle.None;
            if (_viewTasks != null) _viewTasks.style.display = DisplayStyle.None;
            if (_viewSched != null) _viewSched.style.display = DisplayStyle.None;
            if (_viewSecret != null) _viewSecret.style.display = DisplayStyle.None;
            if (_viewTools != null) _viewTools.style.display = DisplayStyle.None;

            if (_tabDash != null) _tabDash.RemoveFromClassList("selected");
            if (_tabTasks != null) _tabTasks.RemoveFromClassList("selected");
            if (_tabSched != null) _tabSched.RemoveFromClassList("selected");
            if (_tabSecret != null) _tabSecret.RemoveFromClassList("selected");
            if (_tabTools != null) _tabTools.RemoveFromClassList("selected");

            if (activeView != null) activeView.style.display = DisplayStyle.Flex;
            if (activeBtn != null) activeBtn.AddToClassList("selected");

            if (activeView == _viewSched) RefreshSchedule();
        }
    }
}