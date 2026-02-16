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

		// Statistics
		public KeyboardStatistics KeyboardStats = new();

		// Project Data (Whiteboard 포함 - Position 필드 사용)
		public List<ProjectItemData> ProjectItems = new();

		// [Obsolete] Legacy Whiteboard Data - ProjectItemData.Position으로 통합됨
		[Obsolete("Use ProjectItemData.Position instead. Kept for data migration.")]
		public List<WhiteboardNodeData> WhiteboardNodes = new();

		/// <summary>
		/// Migrates data from legacy Planner structure to new specialized structures.
		/// </summary>

	}

	public enum KeyboardLayoutType
	{
		ANSI_104,
		Game_WASD,
		MOBA_QWER
	}

	[Serializable]
	public class CompanionData
	{
		public float HudOffset = 0.2f;
		
		public KeyboardLayoutType CurrentLayout = KeyboardLayoutType.ANSI_104;

		// Pomodoro Settings
		public float PomodoroWorkDuration = 25 * 60; // 25 mins
		public float PomodoroShortBreakDuration = 5 * 60; // 5 mins
		public float PomodoroLongBreakDuration = 15 * 60; // 15 mins
		public int PomodoroLongBreakInterval = 4; // Cycles before long break

		// Notification Settings
		public bool UseBeep = true;
		public float AlarmVolume = 0.5f;
		public string CustomAlarmPath = ""; // Path to user selected audio file

		// Keyboard Settings
		public bool ShowKeyboardOverlay = false;
		public bool ShowVirtualKeyboard = true; // Toggle for EKLS view
		public bool PlayKeyboardSfx = false;
		public float KeyboardSfxVolume = 0.5f;
		public float KeyboardRowSeparationThreshold = 1.5f; // Seconds
		public string KeyboardSfxPath = ""; // Path to custom keyboard sound
		public float KeyboardFontSize = 28f;
		public float KeyboardScale = 1.0f;
	}

	[Serializable]
	public class DailyStat
	{
		public string Date;
		public long Count;
	}

	[Serializable]
	public class KeyboardStatistics
	{
		public long TotalKeyPresses = 0;
		public List<DailyStat> DailyStats = new List<DailyStat>();
		
		// Helper to record a key press for today
		public void RecordKeyPress()
		{
			TotalKeyPresses++;
			string today = DateTime.Now.ToString("yyyy-MM-dd");
			
			DailyStat stat = DailyStats.Find(s => s.Date == today);
			if (stat == null)
			{
				stat = new DailyStat { Date = today, Count = 0 };
				DailyStats.Add(stat);
			}
			stat.Count++;
		}
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
