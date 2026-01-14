using System;

namespace KarmoToys.Common.Data
{
	[Serializable]
	public class KarmoToysData
	{
		// 플래너(스케줄) 관련 데이터
		public PlannerData Planner = new();

		// 인생의 주 관련 데이터
		public LifeWeeklyData LifeWeekly = new();

		// 설정 데이터
		public string SaveId = Guid.NewGuid().ToString();
		public AppTheme Theme = AppTheme.Dark;
		public int MaxBackupCount = 1000;
		public bool AutoBackupOnSave = false;
		public int SignificantChangeThreshold = 10;
	}
}
