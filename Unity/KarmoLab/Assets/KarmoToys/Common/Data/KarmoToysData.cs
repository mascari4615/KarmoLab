using System;

namespace KarmoToys.Common.Data
{
    [Serializable]
    public class KarmoToysData
    {
        // 플래너(스케줄) 관련 데이터
        public PlannerData Planner = new PlannerData();

        // 추후 추가될 다른 모듈 데이터
        // public QuestData Quest = new QuestData();
        // public DashboardData Dashboard = new DashboardData();
    }
}
