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
		public ScheduleData Schedule = new();
		public DashboardData Dashboard = new();
		public LifeWeeklyData LifeWeekly = new();

		// Companion Data
		public CompanionData Companion = new();

		// Project Data
		public List<ProjectItemData> ProjectItems = new();

		// Whiteboard Data
		public List<WhiteboardNodeData> WhiteboardNodes = new();

		/// <summary>
		/// Migrates data from legacy Planner structure to new specialized structures.
		/// </summary>

	}

	[Serializable]
	public class CompanionData
	{
		public float HudOffset = 0.2f;
	}

	[Serializable]
	public class WhiteboardNodeData
	{
		public string Id;
		public string Title;
		public string Content;
		public float X;
		public float Y;
		public float Width;
		public float Height;
		public string ColorHex; // For future styling
	}
}
