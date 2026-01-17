using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.Planner
{
	[AddComponentMenu("KarmoLab/Features/Planner")]
	public partial class PlannerFeature : FeatureBase
	{
		public override string FeatureName => Define.FeaturePlanner;
		public override string TabButtonName => Define.TabSchedule;

		// --- Fields from PlannerController Related to Schedule ---

		// Settings are now in KarmoToysSettings (via KarmoToysApp)
		private float _snapInterval = 5f;
		private float _pixelsPerMinute = 0.8f;
		private DayOfWeek _startDayOfWeek = DayOfWeek.Monday;

		private DateTime _currentDate = DateTime.Today;

		// UI Refs (Schedule)
		private Button _prevDayBtn, _nextDayBtn;
		private Label _schedDateLabel;
		private Toggle _weekendToggle;
		private VisualElement _timeRuler;
		private VisualElement _timeAxis;
		private List<VisualElement> _dayColumns = new();

		// Runtime Config Refs
		private DropdownField _uiStartDay;
		private Slider _uiZoom;
		private IntegerField _uiSnap;
		private DropdownField _tagFilterDropdown;

		// State
		private enum DragMode { None, Create, Move, Resize }
		private DragMode _dragMode = DragMode.None;
		private float _dragStartY;
		private VisualElement _ghostBlock;
		private int _dragColumnIndex = -1;
		private float _moveOffsetMin;
		private TimeBlock _moveSourceBlock;
		private TimeBlock _selectedBlock;

		// Resize State (Schedule.cs usually handles this, but fields need to be here or in partial)
		private VisualElement _resizingVisual;
		private float _resizeStartMouseY;
		private float _resizeStartBlockTop;
		private float _resizeStartBlockHeight;


		public override void Initialize(VisualElement root)
		{
			ViewContainer = root.Q("ViewSchedule");

			// UI Bindings
			_prevDayBtn = root.Q<Button>("PrevDayBtn");
			_nextDayBtn = root.Q<Button>("NextDayBtn");
			_schedDateLabel = root.Q<Label>("CurrentDateLabel");
			_weekendToggle = root.Q<Toggle>("WeekendToggle");
			_timeRuler = root.Q("TimeRulerContainer");
			_currentTimeIndicator = root.Q("CurrentTimeIndicator");

			// Runtime Config
			_uiStartDay = root.Q<DropdownField>("StartDayDropdown");
			_uiZoom = root.Q<Slider>("ZoomSlider");
			_uiSnap = root.Q<IntegerField>("SnapIntervalInput");
			_tagFilterDropdown = root.Q<DropdownField>("TagFilterDropdown");

			// Events
			_prevDayBtn.clicked += OnPrevWeek;
			_nextDayBtn.clicked += OnNextWeek;

			// Config Events
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
			_uiZoom.RegisterValueChangedCallback(evt => { _pixelsPerMinute = evt.newValue; RefreshSchedule(); });

			_uiSnap.value = (int)_snapInterval;
			_uiSnap.RegisterValueChangedCallback(evt => _snapInterval = Mathf.Max(1, evt.newValue));

			_tagFilterDropdown.RegisterValueChangedCallback(evt => RefreshSchedule());

			_weekendToggle.RegisterValueChangedCallback(evt => RefreshSchedule());

			// Init Defaults from Settings
			if (KarmoToysApp.Instance.Settings != null)
			{
				_snapInterval = KarmoToysApp.Instance.Settings.DefaultSnapInterval;
				_pixelsPerMinute = KarmoToysApp.Instance.Settings.DefaultPixelsPerMinute;
				_startDayOfWeek = KarmoToysApp.Instance.Settings.DefaultStartDay;
			}

			// Init Logic
			AdjustCurrentDateToStartOfWeek();

			// Setup Ruler Interaction
			_timeRuler.RegisterCallback<PointerDownEvent>(OnRulerPointerDown);
			_timeRuler.RegisterCallback<PointerMoveEvent>(OnRulerPointerMove);
			_timeRuler.RegisterCallback<PointerUpEvent>(OnRulerPointerUp);
			_timeRuler.RegisterCallback<PointerLeaveEvent>(OnRulerPointerUp);

			InitializeDialogs(root); // In Partial

			// 현재 시간 표시 바 실시간 갱신 등록 (1초 간격)
			ViewContainer.schedule.Execute(UpdateCurrentTimeIndicator).Every(1000);
			UpdateCurrentTimeIndicator();
		}

		public override void OnSelect()
		{
			base.OnSelect();
			RefreshSchedule();
		}

		public override void OnDeselect()
		{
			base.OnDeselect();
			HideDetailPopup();
			HideEditDialog();
			HideRecurrencePopup();
			HideTrashPopup();
		}
	}
}
