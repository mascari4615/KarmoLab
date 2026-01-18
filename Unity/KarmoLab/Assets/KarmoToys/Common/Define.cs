namespace KarmoToys.Common
{
	public static class Define
	{
		// Files
		public const string SaveFileName = "planner_data.json";
		public const string EditorDataPath = "../Data/";

		// Features
		public const string FeatureDashboard = "Dashboard";
		public const string FeaturePlanner = "Planner";
		public const string FeatureToolBox = "ToolBox";
		public const string FeaturePreferences = "Preferences";
		public const string FeatureProjectManager = "ProjectManager";

		// Tab IDs (UXML Button Names)
		public const string TabDashboard = "TabDashboard";
		public const string TabSchedule = "TabSchedule";
		public const string TabTools = "TabTools";
		public const string TabPreferences = "TabPreferences";
		public const string TabProject = "TabProject";

		// Planner
		public const string DefaultTargetDate = "2027-03-01";
		public const string DefaultTargetName = "Target: Project";
	}

	public enum AppMode
	{
		Main,
		Companion
	}

	public enum AppTheme
	{
		Dark,
		Light
	}
}
