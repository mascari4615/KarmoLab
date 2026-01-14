using System;
using KarmoToys.Features.Dashboard;
using KarmoToys.Features.Note;
using KarmoToys.Features.Planner;
using KarmoToys.Features.QuestBoard;

namespace KarmoToys.Common.Data
{
	[Serializable]
	public class KarmoToysData
	{
		// Legacy Monolith (Keep for Migration)
		public PlannerData Planner = new();

		// Feature-specific Modules
		public DashboardData Dashboard = new();
		public QuestData Quest = new();
		public ScheduleData Schedule = new();
		public NoteData Note = new();

		// 인생의 주 관련 데이터 (Existing)
		public LifeWeeklyData LifeWeekly = new();

		// 설정 데이터
		public string SaveId = Guid.NewGuid().ToString();
		public AppTheme Theme = AppTheme.Dark;
		public int MaxBackupCount = 1000;
		public bool AutoBackupOnSave = false;
		public int SignificantChangeThreshold = 10;

		/// <summary>
		/// Migrates data from the legacy PlannerData monolith to new feature-specific modules.
		/// </summary>
		public void MigrateLegacyData()
		{
			if (Planner == null) return;

			// 1. Dashboard Migration
			if (string.IsNullOrEmpty(Dashboard.MemoContent) && !string.IsNullOrEmpty(Planner.MemoContent))
			{
				Dashboard.MemoContent = Planner.MemoContent;
				Dashboard.TargetName = Planner.TargetName;
				Dashboard.TargetDateString = Planner.TargetDateString;
				Dashboard.StatPersonalTitle = Planner.StatPersonalTitle;
				Dashboard.StatPersonalValue = Planner.StatPersonalValue;
				Dashboard.StatTeamTitle = Planner.StatTeamTitle;
				Dashboard.StatTeamValue = Planner.StatTeamValue;
				Dashboard.Hp = Planner.Hp;
				Dashboard.Mp = Planner.Mp;
				Dashboard.Exp = Planner.Exp;
				Dashboard.LastUpdatedTicks = Planner.LastUpdatedTicks;
			}

			// 2. Quest Migration
			if (Quest.Items.Count == 0 && Planner.Items.Count > 0)
			{
				Quest.PersonalQuestTitle = Planner.PersonalQuestTitle;
				Quest.StudyQuestTitle = Planner.StudyQuestTitle;
				Quest.TeamQuestTitle = Planner.TeamQuestTitle;

				foreach (var oldItem in Planner.Items)
				{
					// Map Legacy TodoItem to New TodoItem
					var newItem = new KarmoToys.Features.QuestBoard.TodoItem(oldItem.Content, oldItem.Category)
					{
						Id = oldItem.Id,
						IsCompleted = oldItem.IsCompleted,
						CreatedAtTicks = oldItem.CreatedAtTicks
					};
					Quest.Items.Add(newItem);
				}
				// Clear legacy to prevent duplicate migration (optional, but safe)
				Planner.Items.Clear();
			}

			// 3. Schedule Migration
			if (Schedule.TimeBlocks.Count == 0 && Planner.TimeBlocks.Count > 0)
			{
				foreach (var oldBlock in Planner.TimeBlocks)
				{
					var newBlock = new KarmoToys.Features.Planner.TimeBlock(oldBlock.DateString, oldBlock.StartMinute, oldBlock.EndMinute, oldBlock.Title)
					{
						Id = oldBlock.Id,
						Description = oldBlock.Description,
						ColorIndex = oldBlock.ColorIndex,
						IsDeleted = oldBlock.IsDeleted,
						DeletedTicks = oldBlock.DeletedTicks,
						Tags = new System.Collections.Generic.List<string>(oldBlock.Tags),
						RecurrenceRule = oldBlock.RecurrenceRule,
						RecurrenceEnd = oldBlock.RecurrenceEnd,
						ExceptionDates = new System.Collections.Generic.List<string>(oldBlock.ExceptionDates)
					};
					Schedule.TimeBlocks.Add(newBlock);
				}
				Planner.TimeBlocks.Clear();
			}

			// 4. Note Migration
			if (Note.SecretNotes.Count == 0 && Planner.SecretNotes.Count > 0)
			{
				foreach (var oldNote in Planner.SecretNotes)
				{
					var newNote = new KarmoToys.Features.Note.SecretNote(oldNote.Problem, oldNote.Why, oldNote.Solution)
					{
						Id = oldNote.Id,
						DateString = oldNote.DateString
					};
					Note.SecretNotes.Add(newNote);
				}
				Planner.SecretNotes.Clear();
			}
		}
	}
}
