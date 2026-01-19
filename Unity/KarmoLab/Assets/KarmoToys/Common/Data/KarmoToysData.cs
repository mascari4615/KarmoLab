using System;
using System.Collections.Generic;
using KarmoToys.Features.Planner;
using KarmoToys.Features.Dashboard;

namespace KarmoToys.Common.Data
{
	[Serializable]
	public class KarmoToysData
	{
		// App Settings
		public string Theme = "Dark";
		public bool AutoBackupOnSave = true;
		public int SignificantChangeThreshold = 10;
		public int MaxBackupCount = 100;
		public string SaveId = ""; // Unique ID for this save file

		// Feature Data
		public ScheduleData Schedule = new ScheduleData();
		public DashboardData Dashboard = new DashboardData();
		public LifeWeeklyData LifeWeekly = new LifeWeeklyData();

		// Companion Data
		public CompanionData Companion = new CompanionData();

		// Project Data
		public List<ProjectItemData> ProjectItems = new List<ProjectItemData>();

		/// <summary>
		/// Migrates data from legacy Planner structure to new specialized structures.
		/// </summary>

	}

	[Serializable]
	public class CompanionData
	{
		public float HudOffset = 0.2f;
	}
}
