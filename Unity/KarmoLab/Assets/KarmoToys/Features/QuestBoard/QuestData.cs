using System;
using System.Collections.Generic;

namespace KarmoToys.Features.QuestBoard
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
	public class QuestData
	{
		public List<TodoItem> Items = new List<TodoItem>();
		
		// Quest Board Specific Titles (migrated from PlannerData)
		public string PersonalQuestTitle = "MAIN QUEST: Personal";
		public string StudyQuestTitle = "SKILL GRINDING: Study";
		public string TeamQuestTitle = "SIDE QUEST: Team";
	}
}
