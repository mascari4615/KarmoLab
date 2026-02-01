using System;
using UnityEngine;

namespace KarmoToys.Common
{
	[CreateAssetMenu(fileName = "KarmoToysSettings", menuName = "KarmoLab/KarmoToys/Settings")]
	public class KarmoToysSettings : ScriptableObject
	{
		[Header("Planner Settings")]
		[Tooltip("Default snap interval in minutes for drag and drop.")]
		public float DefaultSnapInterval = 5f;

		[Tooltip("Default vertical scale in pixels per minute.")]
		[Range(0.5f, 5f)]
		public float DefaultPixelsPerMinute = 0.8f;

		[Tooltip("Default start day of the week.")]
		public DayOfWeek DefaultStartDay = DayOfWeek.Monday;

		[Header("Save Settings")]
		[Tooltip("Maximum number of rolling backups to keep.")]
		public int MaxBackupCount = 1000;

		[Header("Companion Settings")]
		[Tooltip("Data for Companion Speech Bubble and Reactions")]
		public KarmoToys.Features.Companion.CompanionTalkData CompanionData;

		[Tooltip("Default Alarm Sound Clip (Editor Setting)")]
		public AudioClip DefaultAlarmClip;

		[Header("Debug Settings")]
		[Tooltip("Check this to force Companion Mode when playing in Unity Editor")]
		public bool SimulateCompanionMode;
	}
}
