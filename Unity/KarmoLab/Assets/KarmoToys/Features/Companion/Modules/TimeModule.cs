using System;
using System.Collections.Generic;
using UnityEngine;
using KarmoToys.Features.Companion.Data;

namespace KarmoToys.Features.Companion.Modules
{
	public class TimeModule : ICompanionModule
	{
		private CompanionContext _context;
		private ChatModule _chatModule;

		private List<CompanionAlarmData> _alarms;
		private float _checkTimer;
		private int _lastTriggeredMinute = -1; // To prevent multiple triggers in the same minute

		private AudioSource _audioSource;

		public void Initialize(CompanionContext context)
		{
			_context = context;
			RefreshAlarms();
			InitializeAudio();
		}

		private void InitializeAudio()
		{
			if (_context.RootUI != null)
			{
				// We need a GameObject to hold AudioSource. CompanionFeature is on a GO, let's use that if possible.
				// But Context doesn't expose the Feature's GO.
				// Let's create a temporary hidden GO for sound or attach to SelectedAvatar if available.
				// Better: Create a dedicated GameObject for audio.
				GameObject audioGo = new GameObject("CompanionAudio");
				_audioSource = audioGo.AddComponent<AudioSource>();
				GameObject.DontDestroyOnLoad(audioGo); // Keep it alive
			}
		}

		public void SetChatModule(ChatModule chatModule)
		{
			_chatModule = chatModule;
		}

		public void RefreshAlarms()
		{
			if (_context.Settings != null && _context.Settings.CompanionData != null)
			{
				_alarms = _context.Settings.CompanionData.Alarms;
			}
			else
			{
				_alarms = new List<CompanionAlarmData>();
			}
		}

		public void Update()
		{
			// Check every 1 second (no need for frame-perfect accuracy)
			_checkTimer += Time.deltaTime;
			if (_checkTimer < 1.0f) return;
			_checkTimer = 0f;

			CheckAlarms();
		}

		private void CheckAlarms()
		{
			if (_alarms == null || _alarms.Count == 0) return;

			DateTime now = DateTime.Now;
			int currentMinute = now.Hour * 60 + now.Minute;

			if (currentMinute == _lastTriggeredMinute) return;
			_lastTriggeredMinute = currentMinute;

			DayOfWeek currentDay = now.DayOfWeek;
			DaysOfWeekFlags currentDayFlag = GetDayFlag(currentDay);

			foreach (var alarm in _alarms)
			{
				if (!alarm.IsEnabled) continue;

				if (alarm.Hour == now.Hour && alarm.Minute == now.Minute)
				{
					if (!alarm.Repeat)
					{
						TriggerAlarm(alarm);
						alarm.IsEnabled = false;
					}
					else
					{
						if ((alarm.RepeatDays & currentDayFlag) != 0)
						{
							TriggerAlarm(alarm);
						}
					}
				}
			}
		}

		private void TriggerAlarm(CompanionAlarmData alarm)
		{
			Debug.Log($"[TimeModule] Alarm Triggered: {alarm.Label}");

			// 1. Show Message
			if (_chatModule != null && !string.IsNullOrEmpty(alarm.Message))
			{
				_chatModule.ShowChat(alarm.Message);
			}

			// 2. Play Sound
			if (alarm.PlaySound && _audioSource != null)
			{
				if (alarm.UseBeep)
				{
					PlayProceduralBeep(alarm.Volume);
				}
				// Future: Else play AudioClip
			}

			// 3. Window Shake Effect (Visual feedback)
			if (alarm.ShakeWindow && _context.SelectedAvatar != null)
			{
				// Todo: Implement shake
			}
		}

		private void PlayProceduralBeep(float volume)
		{
			// Generate a simple beep clip on the fly
			int frequency = 1000; // 1kHz beep
			int sampleRate = 44100;
			float duration = 0.5f;
			int sampleCount = (int)(sampleRate * duration);
			float[] samples = new float[sampleCount];

			for (int i = 0; i < sampleCount; i++)
			{
				samples[i] = Mathf.Sin(2 * Mathf.PI * frequency * i / sampleRate);
			}

			AudioClip clip = AudioClip.Create("Beep", sampleCount, 1, sampleRate, false);
			clip.SetData(samples, 0);

			_audioSource.PlayOneShot(clip, volume);
		}

		private DaysOfWeekFlags GetDayFlag(DayOfWeek day)
		{
			return day switch
			{
				DayOfWeek.Sunday => DaysOfWeekFlags.Sun,
				DayOfWeek.Monday => DaysOfWeekFlags.Mon,
				DayOfWeek.Tuesday => DaysOfWeekFlags.Tue,
				DayOfWeek.Wednesday => DaysOfWeekFlags.Wed,
				DayOfWeek.Thursday => DaysOfWeekFlags.Thu,
				DayOfWeek.Friday => DaysOfWeekFlags.Fri,
				DayOfWeek.Saturday => DaysOfWeekFlags.Sat,
				_ => DaysOfWeekFlags.None,
			};
		}

		public void OnDestroy()
		{
			if (_audioSource != null)
			{
				GameObject.Destroy(_audioSource.gameObject);
			}
		}
	}
}
