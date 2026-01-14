using System;

namespace KarmoToys.Common.Data
{
	[Serializable]
	public class KarmoToysData
	{
		// 플래너(스케줄) 관련 데이터
		public PlannerData Planner = new();

		// 설정 데이터
		public AppTheme Theme = AppTheme.Dark;
	}
}
