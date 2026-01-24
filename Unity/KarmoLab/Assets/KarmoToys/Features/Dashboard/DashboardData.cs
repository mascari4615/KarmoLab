using System;

namespace KarmoToys.Features.Dashboard
{
	[Serializable]
	public class DashboardData
	{
		public string MemoContent = "";

		// 목표 / D-Day
		public string TargetName = "Target Project";
		public string TargetDateString = "2027-03-01"; // 기본 ?�짜

		// Dashboard Stat Cards
		public string StatPersonalTitle = "Personal Project";
		public string StatPersonalValue = "In Progress";
		public string StatTeamTitle = "Team Project";
		public string StatTeamValue = "In Progress";
	}
}
