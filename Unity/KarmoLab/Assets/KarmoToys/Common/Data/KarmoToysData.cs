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

		// Project Data (Whiteboard 포함 - Position 필드 사용)
		public List<ProjectItemData> ProjectItems = new();

		// [Obsolete] Legacy Whiteboard Data - ProjectItemData.Position으로 통합됨
		[Obsolete("Use ProjectItemData.Position instead. Kept for data migration.")]
		public List<WhiteboardNodeData> WhiteboardNodes = new();

		/// <summary>
		/// Migrates data from legacy Planner structure to new specialized structures.
		/// </summary>

	}

	[Serializable]
	public class CompanionData
	{
		public float HudOffset = 0.2f;

		// Pomodoro Settings
		public float PomodoroWorkDuration = 25 * 60; // 25 mins
		public float PomodoroShortBreakDuration = 5 * 60; // 5 mins
		public float PomodoroLongBreakDuration = 15 * 60; // 15 mins
		public int PomodoroLongBreakInterval = 4; // Cycles before long break

		// Notification Settings
		public bool UseBeep = true;
		public float AlarmVolume = 0.5f;
		public string CustomAlarmPath = ""; // Path to user selected audio file
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
