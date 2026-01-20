using System;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Common.Data;

namespace KarmoToys.Features.ProjectManager.Timeline
{
	public class TimelineItem : VisualElement
	{
		public ProjectItemData Data { get; private set; }
		public string Id => Data.Id;

		private Label _label;
		private VisualElement _resizeLeft;
		private VisualElement _resizeRight;

		public TimelineItem(ProjectItemData data)
		{
			Data = data;

			AddToClassList("timeline-bar");

			// Visuals
			_label = new Label(data.Title);
			_label.style.overflow = Overflow.Hidden;
			_label.style.whiteSpace = WhiteSpace.NoWrap;
			_label.style.color = new StyleColor(Color.black);
			Add(_label);

			// Handles (Visual only for now)
			_resizeLeft = new VisualElement { name = "HandleLeft" };
			_resizeLeft.style.position = Position.Absolute;
			_resizeLeft.style.left = 0;
			_resizeLeft.style.width = 5;
			_resizeLeft.style.height = Length.Percent(100);
			_resizeLeft.style.backgroundColor = new StyleColor(new Color(0, 0, 0, 0.1f));
			Add(_resizeLeft);

			_resizeRight = new VisualElement { name = "HandleRight" };
			_resizeRight.style.position = Position.Absolute;
			_resizeRight.style.right = 0;
			_resizeRight.style.width = 5;
			_resizeRight.style.height = Length.Percent(100);

			_resizeRight.style.backgroundColor = new StyleColor(new Color(0, 0, 0, 0.1f));
			Add(_resizeRight);

			// Initial Style Update
			UpdateVisuals();
		}

		public void SetTempLabel(string text)
		{
			_label.text = text;
			_label.style.unityFontStyleAndWeight = FontStyle.Bold;
		}

		public void ResetLabel()
		{
			_label.text = Data.Title;
			_label.style.unityFontStyleAndWeight = FontStyle.Normal;
		}

		public void UpdateVisuals()
		{
			_label.text = Data.Title;
			// Background color could change based on status/priority
			switch (Data.Status)
			{
				case MemoStatus.Done: style.backgroundColor = new StyleColor(new Color(0.5f, 0.8f, 0.5f)); break; // Greenish
				case MemoStatus.Doing: style.backgroundColor = new StyleColor(new Color(0.5f, 0.6f, 1f)); break; // Blueish
				default: style.backgroundColor = new StyleColor(new Color(0.9f, 0.7f, 0.7f)); break; // Reddish
			}
		}
	}
}
