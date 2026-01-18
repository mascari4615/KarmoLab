using System;
using System.Collections.Generic;
using UnityEngine;
using KarmoToys.Features.QuestBoard;
using KarmoToys.Features.Planner;
using KarmoToys.Features.Note;
using KarmoToys.Features.Dashboard;

namespace KarmoToys.Common.Data
{
	[Serializable]
	public class KarmoToysData
	{
		// App Settings
		public string Theme = "Dark";
		public bool AutoBackupOnSave = true;
		public int SignificantChangeThreshold = 10;
		public int MaxBackupCount = 100;
		public string SaveId = ""; // Unique ID for this save file

		// Feature Data
		public QuestData Quest = new QuestData();
		public PlannerData Planner = new PlannerData(); // Legacy combined data
		public ScheduleData Schedule = new ScheduleData();
		public DashboardData Dashboard = new DashboardData();
		public LifeWeeklyData LifeWeekly = new LifeWeeklyData();
		public NoteData Note = new NoteData();

		// New separated structures (for migration/future use)
		public List<KarmoToys.Features.QuestBoard.TodoItem> ScheduleItems = new List<KarmoToys.Features.QuestBoard.TodoItem>();
		public List<KarmoToys.Features.Planner.TimeBlock> TimeBlocks = new List<KarmoToys.Features.Planner.TimeBlock>();

		/// <summary>
		/// Migrates data from legacy Planner structure to new specialized structures.
		/// </summary>
		public void MigrateIfNeeded()
		{
			// 1. Quest Migration
			if (Quest.Items.Count == 0 && Planner.Items.Count > 0)
			{
				foreach (KarmoToys.Common.Data.TodoItem oldItem in Planner.Items)
				{
					// Map Legacy TodoItem to New TodoItem
					KarmoToys.Features.QuestBoard.TodoItem newItem = new KarmoToys.Features.QuestBoard.TodoItem(oldItem.Content, oldItem.Category)
					{
						Id = oldItem.Id,
						IsCompleted = oldItem.IsCompleted,
						CreatedAtTicks = oldItem.CreatedAtTicks
					};
					Quest.Items.Add(newItem);
				}
				Planner.Items.Clear();
			}

			// 2. Schedule Migration
			if (Schedule.TimeBlocks.Count == 0 && Planner.TimeBlocks.Count > 0)
			{
				foreach (KarmoToys.Common.Data.TimeBlock oldBlock in Planner.TimeBlocks)
				{
					KarmoToys.Features.Planner.TimeBlock newBlock = new KarmoToys.Features.Planner.TimeBlock(oldBlock.DateString, oldBlock.StartMinute, oldBlock.EndMinute, oldBlock.Title)
					{
						Id = oldBlock.Id,
						Description = oldBlock.Description,
						ColorIndex = oldBlock.ColorIndex,
						IsDeleted = oldBlock.IsDeleted,
						DeletedTicks = oldBlock.DeletedTicks,
						Tags = new List<string>(oldBlock.Tags),
						RecurrenceRule = oldBlock.RecurrenceRule,
						RecurrenceEnd = oldBlock.RecurrenceEnd,
						ExceptionDates = new List<string>(oldBlock.ExceptionDates)
					};
					Schedule.TimeBlocks.Add(newBlock);
				}
				Planner.TimeBlocks.Clear();
			}

			// 3. Note Migration
			if (Note.SecretNotes.Count == 0 && Planner.SecretNotes.Count > 0)
			{
				foreach (KarmoToys.Common.Data.SecretNote oldNote in Planner.SecretNotes)
				{
					KarmoToys.Features.Note.SecretNote newNote = new KarmoToys.Features.Note.SecretNote(oldNote.Problem, oldNote.Why, oldNote.Solution)
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
