using UnityEngine;
using UnityEngine.UIElements;

namespace KarmoToys.Common.UI
{
	// <summary>
	/// Custom UI Field for time input (HH:MM or MM:SS)
	/// Currently used for Pomodoro durations
	/// </summary>
	[UxmlElement]
	public partial class TimePickerField : VisualElement
	{
		[UxmlAttribute("label")]
		public string label
		{
			get => _titleLabel.text;
			set => _titleLabel.text = value;
		}

		private Label _titleLabel;
		private TextField _hourField;
		private TextField _minuteField;

		public event System.Action<float> OnValueChanged;

		public TimePickerField()
		{
			style.flexDirection = FlexDirection.Row;
			style.alignItems = Align.Center;
			style.marginBottom = 5;

			_titleLabel = new Label { style = { width = 120, color = Color.white } };
			Add(_titleLabel);

			_hourField = CreateTimeTextField();
			_minuteField = CreateTimeTextField();

			Add(_hourField);
			Add(new Label(":") { style = { color = Color.white, marginLeft = 2, marginRight = 2 } });
			Add(_minuteField);

			_hourField.RegisterValueChangedCallback(evt => NotifyChanged());
			_minuteField.RegisterValueChangedCallback(evt => NotifyChanged());
		}

		private TextField CreateTimeTextField()
		{
			TextField tf = new TextField { style = { width = 40 } };
			tf.value = "00";
			// Limit to numbers only? (Simple validation)
			return tf;
		}

		public void SetValueWithoutNotify(float seconds)
		{
			int h = Mathf.FloorToInt(seconds / 60);
			int m = Mathf.FloorToInt(seconds % 60);
			_hourField.SetValueWithoutNotify(h.ToString("00"));
			_minuteField.SetValueWithoutNotify(m.ToString("00"));
		}

		private void NotifyChanged()
		{
			if (int.TryParse(_hourField.value, out int h) && int.TryParse(_minuteField.value, out int m))
			{
				float total = (h * 60) + m;
				OnValueChanged?.Invoke(total);
			}
		}
	}
}
