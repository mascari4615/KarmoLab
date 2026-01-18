using System;
using UnityEngine;

namespace KarmoToys.Features.Companion.Data
{
	[Serializable]
	public class CompanionAlarmData
	{
		public string Label = "New Alarm";
		public bool IsEnabled = true;

		[Header("Time")]
		[Tooltip("24-hour format (0-23)")]
		[Range(0, 23)] public int Hour = 8;
		[Range(0, 59)] public int Minute = 0;

		[Header("Repeat")]
		public bool Repeat = true;
		[Tooltip("Days to repeat this alarm")]
		public DaysOfWeekFlags RepeatDays = DaysOfWeekFlags.Mon | DaysOfWeekFlags.Tue | DaysOfWeekFlags.Wed | DaysOfWeekFlags.Thu | DaysOfWeekFlags.Fri;

		[Header("Action")]
		public string Message = "Time to wake up!";
		public bool ShakeWindow = true; // Effect: Shake the companion or window

		[Header("Sound")]
		public bool PlaySound = true;
		[Range(0f, 1f)]
		public float Volume = 1.0f;
		public bool UseBeep = true; // If true, generate beep. If false, use AudioClip (future)
	}

	[Flags]
	public enum DaysOfWeekFlags
	{
		None = 0,
		Sun = 1 << 0,
		Mon = 1 << 1,
		Tue = 1 << 2,
		Wed = 1 << 3,
		Thu = 1 << 4,
		Fri = 1 << 5,
		Sat = 1 << 6,
		All = Sun | Mon | Tue | Wed | Thu | Fri | Sat,
		Weekdays = Mon | Tue | Wed | Thu | Fri,
		Weekends = Sat | Sun
	}
}
