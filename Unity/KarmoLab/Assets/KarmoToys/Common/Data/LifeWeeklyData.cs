using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Common.Data
{
	[Serializable]
	public class LifeWeeklyData
	{
		public string BirthDate = DateTime.Now.ToString("yyyy-MM-dd");
		public int TargetAge = 100;
		public int WeeksPerRow = 52;
		public int BlockSize = 10;
		public bool ShowYearlyHighlight = true;
		public bool ShowCalendarYearHighlight = false;
		public bool ShowDecadeHighlight = true;
		public List<LifeMilestone> Milestones = new();
	}

	[Serializable]
	public class LifeMilestone
	{
		public string Date;
		public string Description;
		public string Color;
	}

}
