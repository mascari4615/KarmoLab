using System;
using System.Collections.Generic;

namespace KarmoToys.Common.Data
{
	[Serializable]
	public class TodoItem
	{
		public string Id;
		public string Content;
		public bool IsCompleted;
		public string Category; // "개인", "?�습", "?�"
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
		// ?�짜 ?�기?��? ?�해 Ticks ?�??DateTime 문자??yyyy-MM-dd)?�나 long Ticks ?�용
		// ?�기?�는 ?�루 ?�위 관리�? ?�해 "?????? 문자?�로 그룹?�하�?
		// ?�작/종료 ?�간?� "00:00" ~ "23:59"�?�?Minute) ?�위 ?�수(0~1440)�??�?�하??것이 ?�루�??�습?�다.
		public string DateString; // "2024-01-09"
		public int StartMinute;   // 0 (00:00) ~ 1439 (23:59)
		public int EndMinute;	 // StartMinute < EndMinute
		public int ColorIndex;	// ?�상 구분??
		public bool IsDeleted;	// ?��????��?
		public long DeletedTicks; // ??��???�간 (복구/?�구??�� 기�?)
		public List<string> Tags = new(); // ?�그 목록

		// --- Recurring Fields ---
		public string RecurrenceRule;   // "NONE", "DAILY", "WEEKLY", "MONTHLY"
		public string RecurrenceEnd;	// 종료 ?�짜 문자??(yyyy-MM-dd) or null if infinite
		public List<string> ExceptionDates = new(); // 반복?�서 ?�외???�짜??(??��/개별?�정)

		public TimeBlock(string date, int start, int end, string title)
		{
			Id = Guid.NewGuid().ToString();
			DateString = date;
			StartMinute = start;
			EndMinute = end;
			Title = title;
			ColorIndex = UnityEngine.Random.Range(0, 5); // ?�시 ?�덤 컬러
		}
	}

	[Serializable]
	public class PlannerData
	{
		public List<TodoItem> Items = new();
		public List<TimeBlock> TimeBlocks = new();
		public List<SecretNote> SecretNotes = new();

		public string MemoContent = "";

		// 목표 / D-Day
		public string TargetName = "Target Project";
		public string TargetDateString = "2027-03-01"; // 기본 ?�짜

		// ?�용??지???�더 (?�드코딩??개인?�보 ?��?
		public string PersonalQuestTitle = "MAIN QUEST: Personal";
		public string StudyQuestTitle = "SKILL GRINDING: Study";
		public string TeamQuestTitle = "SIDE QUEST: Team";

		public string StatPersonalTitle = "Personal Project";
		public string StatPersonalValue = "In Progress";
		public string StatTeamTitle = "Team Project";
		public string StatTeamValue = "In Progress";

		// RPG ?�탯 ?��??�이??
		public int Hp = 75;
		public int Mp = 60;
		public int Exp = 30;

		public long LastUpdatedTicks;
	}
}
