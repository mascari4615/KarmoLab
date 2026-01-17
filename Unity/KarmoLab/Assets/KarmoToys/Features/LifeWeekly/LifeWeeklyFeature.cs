using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Core;
using KarmoToys.Main;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.LifeWeekly
{
	public class LifeWeeklyFeature : FeatureBase
	{
		public override string FeatureName => "Life Weekly Visualizer";
		public override string TabButtonName => "TabLifeWeekly";

		private VisualElement _view;
		private VisualElement _grid;
		private IntegerField _ageInput;
		private IntegerField _weeksPerRowInput;
		private IntegerField _blockSizeInput;
		private Slider _blockSizeSlider;
		private IntegerField _birthYearInput;
		private IntegerField _birthMonthInput;
		private IntegerField _birthDayInput;
		private Toggle _toggleYearly;
		private Toggle _toggleCalendar;
		private Toggle _toggleDecade;

		private List<VisualElement> _blocks = new();

		public override void Initialize(VisualElement root)
		{
			_view = root.Q("ViewLifeWeekly");
			_grid = root.Q<VisualElement>("LifeWeeklyGrid");
			_ageInput = root.Q<IntegerField>("LifeTargetAgeInput");
			_weeksPerRowInput = root.Q<IntegerField>("LifeWeeksPerRowInput");
			_blockSizeInput = root.Q<IntegerField>("LifeBlockSizeInput");
			_blockSizeSlider = root.Q<Slider>("LifeBlockSizeSlider");
			_birthYearInput = root.Q<IntegerField>("LifeBirthYearInput");
			_birthMonthInput = root.Q<IntegerField>("LifeBirthMonthInput");
			_birthDayInput = root.Q<IntegerField>("LifeBirthDayInput");
			_toggleYearly = root.Q<Toggle>("ToggleYearlyHighlight");
			_toggleCalendar = root.Q<Toggle>("ToggleCalendarHighlight");
			_toggleDecade = root.Q<Toggle>("ToggleDecadeHighlight");

			var data = KarmoToysApp.Instance.Data.LifeWeekly;

			// 생일 날짜 파싱 및 초기값 설정.
			if (DateTime.TryParse(data.BirthDate, out var birth))
			{
				_birthYearInput.value = birth.Year;
				_birthMonthInput.value = birth.Month;
				_birthDayInput.value = birth.Day;
			}

			Action onDateChanged = () =>
			{
				try
				{
					DateTime newDate = new DateTime(_birthYearInput.value, _birthMonthInput.value, _birthDayInput.value);
					data.BirthDate = newDate.ToString("yyyy-MM-dd");
					KarmoToysApp.Instance.SaveData();
					RefreshGrid();
				}
				catch { /* 잘못된 날짜 무시 */ }
			};

			_birthYearInput.RegisterValueChangedCallback(_ => onDateChanged());
			_birthMonthInput.RegisterValueChangedCallback(_ => onDateChanged());
			_birthDayInput.RegisterValueChangedCallback(_ => onDateChanged());

			_toggleYearly.value = data.ShowYearlyHighlight;
			_toggleYearly.RegisterValueChangedCallback(evt =>
			{
				data.ShowYearlyHighlight = evt.newValue;
				KarmoToysApp.Instance.SaveData();
				RefreshGrid();
			});

			_toggleCalendar.value = data.ShowCalendarYearHighlight;
			_toggleCalendar.RegisterValueChangedCallback(evt =>
			{
				data.ShowCalendarYearHighlight = evt.newValue;
				KarmoToysApp.Instance.SaveData();
				RefreshGrid();
			});

			_toggleDecade.value = data.ShowDecadeHighlight;
			_toggleDecade.RegisterValueChangedCallback(evt =>
			{
				data.ShowDecadeHighlight = evt.newValue;
				KarmoToysApp.Instance.SaveData();
				RefreshGrid();
			});

			_ageInput.value = data.TargetAge;
			_ageInput.RegisterValueChangedCallback(evt =>
			{
				data.TargetAge = Mathf.Clamp(evt.newValue, 1, 200);
				KarmoToysApp.Instance.SaveData();
				GenerateBlocks(); // 블록 개수 변경 시 재생성.
				RefreshGrid();
			});

			_weeksPerRowInput.value = data.WeeksPerRow;
			_weeksPerRowInput.RegisterValueChangedCallback(evt =>
			{
				data.WeeksPerRow = Mathf.Clamp(evt.newValue, 1, 100);
				KarmoToysApp.Instance.SaveData();
				RefreshGrid();
			});

			_blockSizeInput.value = data.BlockSize;
			_blockSizeSlider.value = data.BlockSize;

			_blockSizeInput.RegisterValueChangedCallback(evt =>
			{
				int val = Mathf.Clamp(evt.newValue, 5, 50);
				data.BlockSize = val;
				_blockSizeSlider.SetValueWithoutNotify(val);
				KarmoToysApp.Instance.SaveData();
				RefreshGrid();
			});

			_blockSizeSlider.RegisterValueChangedCallback(evt =>
			{
				int val = Mathf.RoundToInt(evt.newValue);
				data.BlockSize = val;
				_blockSizeInput.SetValueWithoutNotify(val);
				KarmoToysApp.Instance.SaveData();
				RefreshGrid();
			});

			GenerateBlocks();

			// 1분마다 그리드 표시 갱신 (현재 주차 강조 등)
			root.schedule.Execute(RefreshGrid).Every(60000);
		}

		public override void OnSelect()
		{
			_view.style.display = DisplayStyle.Flex;
			RefreshGrid();
		}

		public override void OnDeselect()
		{
			_view.style.display = DisplayStyle.None;
		}

		private void GenerateBlocks()
		{
			_grid.Clear();
			_blocks.Clear();

			var data = KarmoToysApp.Instance.Data.LifeWeekly;
			int totalWeeks = data.TargetAge * 52;

			// 설정된 수명만큼 블록 생성.
			for (int i = 0; i < totalWeeks; i++)
			{
				var block = new VisualElement();
				block.AddToClassList("week-block");
				_grid.Add(block);
				_blocks.Add(block);
			}
		}

		private void RefreshGrid()
		{
			var data = KarmoToysApp.Instance.Data.LifeWeekly;

			// 성능 최적화: 블록 개별 크기 조절 대신 그리드 전체에 scale 적용. 🌬️✨
			float baseStep = 10f + 4f; // 블록 10px + 마진 2px*2 = 14px
			float scale = data.BlockSize / 10f;

			float originalWidth = data.WeeksPerRow * baseStep;
			int totalRows = Mathf.CeilToInt((float)_blocks.Count / data.WeeksPerRow);
			float originalHeight = totalRows * baseStep;

			_grid.style.width = originalWidth;
			_grid.style.height = originalHeight;
			_grid.style.scale = new StyleScale(new Scale(new Vector3(scale, scale, 1f)));

			// 스크롤 영역 확보를 위해 컨테이너 크기 조절.
			// (그리드가 center 기준이므로 컨테이너가 딱 이 크기면 내부에서 중앙 정렬됨)
			var container = _grid.parent;
			if (container != null)
			{
				container.style.width = originalWidth * scale;
				container.style.height = originalHeight * scale;
			}

			if (!DateTime.TryParse(data.BirthDate, out var birthDate)) return;

			DateTime now = DateTime.Now;
			TimeSpan lived = now - birthDate;

			// 주차 계산 로직 개선 (실제 날짜 기반)
			int currentGridIndex = -1;
			if (now >= birthDate)
			{
				// 전체 경과 주차 계산 (단순 365일이 아닌 실제 7일 단위)
				int totalWeeks = (int)((now - birthDate).TotalDays / 7);
				if (totalWeeks < 5200)
				{
					currentGridIndex = totalWeeks;
				}
			}

			for (int i = 0; i < _blocks.Count; i++)
			{
				var block = _blocks[i];
				block.RemoveFromClassList("week-past");
				block.RemoveFromClassList("week-current");
				block.RemoveFromClassList("week-future");

				if (i < currentGridIndex)
				{
					block.AddToClassList("week-past");
				}
				else if (i == currentGridIndex)
				{
					block.AddToClassList("week-current");
				}
				else
				{
					block.AddToClassList("week-future");
				}

				// 10년 주기 마커 강조 (520주마다)
				block.RemoveFromClassList("week-marker-ten");
				block.RemoveFromClassList("week-marker-one");
				block.RemoveFromClassList("week-marker-calendar");

				if (data.ShowDecadeHighlight && i > 0 && (i + 1) % 520 == 0)
				{
					block.AddToClassList("week-marker-ten");
				}
				else if (data.ShowYearlyHighlight && i > 0 && (i + 1) % 52 == 0)
				{
					block.AddToClassList("week-marker-one");
				}

				// 달력 기준 1년 강조 (1월 1일 포함 주차)
				if (data.ShowCalendarYearHighlight)
				{
					DateTime thisWeekDate = birthDate.AddDays(i * 7);
					DateTime prevWeekDate = birthDate.AddDays((i - 1) * 7);
					if (i > 0 && thisWeekDate.Year > prevWeekDate.Year)
					{
						block.AddToClassList("week-marker-calendar");
					}
				}

				// Tooltip 설정
				int year = i / 52;
				int week = i % 52;
				DateTime blockDate = birthDate.AddDays(i * 7);
				block.tooltip = $"{year}세 {week + 1}주차\n({blockDate.ToString("yyyy-MM-dd")})";
			}
		}
	}
}
