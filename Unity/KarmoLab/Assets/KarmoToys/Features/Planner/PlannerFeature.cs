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
	public partial class PlannerFeature : FeatureBase
	{
		public override string FeatureName => Define.FeaturePlanner;
		public override string TabButtonName => Define.TabSchedule;

		// --- Fields from PlannerController Related to Schedule ---

		[Header("Settings")]
		[Tooltip("Snap interval in minutes for drag and drop.")]
		[SerializeField] private float _snapInterval = 5f;

		[Tooltip("Vertical scale in pixels per minute.")]
		[SerializeField, Range(0.5f, 5f)] private float _pixelsPerMinute = 0.8f;

		[Tooltip("Start day of the week.")]
		[SerializeField] private DayOfWeek _startDayOfWeek = DayOfWeek.Monday;

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
			_timeRuler = root.Q("TimeRulerContainer"); // Ensure ID correct

			// Runtime Config
			_uiStartDay = root.Q<DropdownField>("StartDayDropdown");
			_uiZoom = root.Q<Slider>("ZoomSlider");
			_uiSnap = root.Q<IntegerField>("SnapIntervalInput");
			_tagFilterDropdown = root.Q<DropdownField>("TagFilterDropdown");

			// Events
			if (_prevDayBtn != null) _prevDayBtn.clicked += OnPrevWeek;
			if (_nextDayBtn != null) _nextDayBtn.clicked += OnNextWeek;

			// Config Events
			if (_uiStartDay != null)
			{
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
			}

			if (_uiZoom != null)
			{
				_uiZoom.value = _pixelsPerMinute;
				_uiZoom.RegisterValueChangedCallback(evt => { _pixelsPerMinute = evt.newValue; RefreshSchedule(); });
			}

			if (_uiSnap != null)
			{
				_uiSnap.value = (int)_snapInterval;
				_uiSnap.RegisterValueChangedCallback(evt => _snapInterval = Mathf.Max(1, evt.newValue));
			}

			if (_tagFilterDropdown != null)
			{
				_tagFilterDropdown.RegisterValueChangedCallback(evt => RefreshSchedule());
			}

			if (_weekendToggle != null)
			{
				_weekendToggle.RegisterValueChangedCallback(evt => RefreshSchedule());
			}

			// Init Logic
			AdjustCurrentDateToStartOfWeek();

			// Setup Ruler Interaction
			if (_timeRuler != null)
			{
				_timeRuler.RegisterCallback<PointerDownEvent>(OnRulerPointerDown);
				_timeRuler.RegisterCallback<PointerMoveEvent>(OnRulerPointerMove);
				_timeRuler.RegisterCallback<PointerUpEvent>(OnRulerPointerUp);
				_timeRuler.RegisterCallback<PointerLeaveEvent>(OnRulerPointerUp);
			}

			InitializeDialogs(root); // In Partial
		}

		public override void OnSelect()
		{
			base.OnSelect();
			RefreshSchedule();
			// BuildTimeRuler if needed? usually called in RefreshSchedule or Init
			BuildTimeRuler();
		}

		private void OnPrevWeek()
		{
			_currentDate = _currentDate.AddDays(-7);
			RefreshSchedule();
		}

		private void OnNextWeek()
		{
			_currentDate = _currentDate.AddDays(7);
			RefreshSchedule();
		}

		private void AdjustCurrentDateToStartOfWeek()
		{
			int diff = (7 + (_currentDate.DayOfWeek - _startDayOfWeek)) % 7;
			_currentDate = _currentDate.AddDays(-1 * diff);
		}
	}
}
