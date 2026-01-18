using System;
using System.Collections.Generic;
using UnityEngine;

namespace KarmoToys.Common.Data
{
	[Serializable]
	public enum MemoType
	{
		Task,
		Concept,
		Secret,
		Idea,
		Question
	}

	[Serializable]
	public enum MemoStatus
	{
		Todo,
		Doing,
		Done,
		Archive
	}

	[Serializable]
	public enum Priority
	{
		Low,
		Medium,
		High,
		Critical
	}

	[Serializable]
	public class ProjectItemData
	{
		public string Id;
		public string Title;
		public string Content;

		public MemoType Type;
		public MemoStatus Status;
		public Priority Priority;

		public long StartDateTicks;
		public long EndDateTicks;
		public long CreatedAtTicks;

		// New fields
		public DateTime? DueDate;
		public List<string> Tags = new List<string>();

		// Whiteboard Visualization
		public Vector2 Position;
		public float Angle;
		public int ColorIndex;

		// Metadata (JSON for extensibility)
		public string MetadataJson;

		public ProjectItemData()
		{
			Id = Guid.NewGuid().ToString();
			Title = string.Empty;
			Content = string.Empty;
			Type = MemoType.Task;
			Status = MemoStatus.Todo;
			Priority = Priority.Medium;
			DueDate = null; // Initialize new field
			Tags = new List<string>(); // Initialize new field
			CreatedAtTicks = DateTime.UtcNow.Ticks;
			Position = Vector2.zero;
			Angle = 0f;
		}

		public ProjectItemData(string title, string content, MemoType type = MemoType.Task) : this()
		{
			Title = title;
			Content = content;
			Type = type;
		}
	}
}
