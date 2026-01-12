using System;
using System.Collections.Generic;

namespace KarmoLab.Module.Planner
{
	[Serializable]
	public class TodoItem
	{
		public string Id;
		public string Content;
		public bool IsCompleted;
		public string Category; // "개인", "학습", "팀"
		public long CreatedAtTicks;

		public TodoItem(string content, string category = "personal")
		{
			Id = Guid.NewGuid().ToString();
			Content = content;
			IsCompleted = false;
			Category = category;
			CreatedAtTicks = DateTime.UtcNow.Ticks;
		}
	}

	[Serializable]
	public class SecretNote
	{
		public string Id;
		public string DateString;
		public string Problem;
		public string Why;
		public string Solution;
		public string AiAnalysis;

		public SecretNote(string problem, string why, string solution)
		{
			Id = Guid.NewGuid().ToString();
			DateString = DateTime.Now.ToString("yyyy-MM-dd");
			Problem = problem;
			Why = why;
			Solution = solution;
		}
	}

	[Serializable]
	public class TimeBlock
	{
		public string Id;
		public string Title;
		public string Description;
		// 날짜 동기화를 위해 Ticks 대신 DateTime 문자열(yyyy-MM-dd)이나 long Ticks 사용
		// 여기서는 하루 단위 관리를 위해 "년-월-일" 문자열로 그룹핑하고,
		// 시작/종료 시간은 "00:00" ~ "23:59"를 분(Minute) 단위 정수(0~1440)로 저장하는 것이 다루기 쉽습니다.
		public string DateString; // "2024-01-09"
		public int StartMinute;   // 0 (00:00) ~ 1439 (23:59)
		public int EndMinute;     // StartMinute < EndMinute
		public int ColorIndex;    // 색상 구분용
		public bool IsDeleted;    // 휴지통 여부
		public long DeletedTicks; // 삭제된 시간 (복구/영구삭제 기준)
		public List<string> Tags = new List<string>(); // 태그 목록

		public TimeBlock(string date, int start, int end, string title)
		{
			Id = Guid.NewGuid().ToString();
			DateString = date;
			StartMinute = start;
			EndMinute = end;
			Title = title;
			ColorIndex = UnityEngine.Random.Range(0, 5); // 임시 랜덤 컬러
		}
	}

	[Serializable]
	public class PlannerData
	{
		public List<TodoItem> Items = new List<TodoItem>();
		public List<TimeBlock> TimeBlocks = new List<TimeBlock>();
		public List<SecretNote> SecretNotes = new List<SecretNote>();

		public string MemoContent = "";

		// 목표 / D-Day
		public string TargetName = "Target Project";
		public string TargetDateString = "2027-03-01"; // 기본 날짜

		// 사용자 지정 헤더 (하드코딩된 개인정보 대체)
		public string PersonalQuestTitle = "MAIN QUEST: Personal";
		public string StudyQuestTitle = "SKILL GRINDING: Study";
		public string TeamQuestTitle = "SIDE QUEST: Team";

		public string StatPersonalTitle = "Personal Project";
		public string StatPersonalValue = "In Progress";
		public string StatTeamTitle = "Team Project";
		public string StatTeamValue = "In Progress";

		// RPG 스탯 시뮬레이션
		public int Hp = 75;
		public int Mp = 60;
		public int Exp = 30;

		public long LastUpdatedTicks;
	}
}
