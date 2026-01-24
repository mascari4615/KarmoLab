using System;
using System.Collections.Generic;

namespace KarmoToys.Features.Planner
{
	[Serializable]
	public class TimeBlock
	{
		public string Id;
		public string Title;
		public string Description;
		public string DateString; // "2024-01-09"
		public int StartMinute;   // 0 (00:00) ~ 1439 (23:59)
		public int EndMinute;    // StartMinute < EndMinute
		public int ColorIndex;  // 색상 구분값
		public bool IsDeleted;  // 삭제 여부
		public long DeletedTicks; // 삭제된 시간 (복구/영구삭제 기준)
		public List<string> Tags = new(); // 태그 목록

		// --- Recurring Fields ---
		public string RecurrenceRule;   // "NONE", "DAILY", "WEEKLY", "MONTHLY"
		public string RecurrenceEnd;    // 종료 날짜 문자열 (yyyy-MM-dd) or null if infinite
		public List<string> ExceptionDates = new(); // 반복에서 제외된 날짜들 (삭제/개별수정)

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
	public class ScheduleData
	{
		public List<TimeBlock> TimeBlocks = new();
	}
}
