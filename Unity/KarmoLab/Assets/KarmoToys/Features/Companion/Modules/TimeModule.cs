using System;
using System.Collections.Generic;
using UnityEngine;
using KarmoToys.Features.Companion.Data;

namespace KarmoToys.Features.Companion.Modules
{
	public class TimeModule : ICompanionModule
	{
		// --- Internal Data Structures ---
		public class TimerData
		{
			public string Id = System.Guid.NewGuid().ToString();
			public string Label = "Timer";
			public float Duration; // Seconds
			public float RemainingTime;
			public bool IsRunning;
			public bool IsFinished;
		}

		public class StopwatchData
		{
			public bool IsRunning;
			public float ElapsedTime;
		}

		private CompanionContext _context;
		private ChatModule _chatModule;

		private List<CompanionAlarmData> _alarms;

		// State
		private float _checkTimer;
		private List<TimerData> _activeTimers = new();
		private StopwatchData _stopwatch = new();

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
			float dt = Time.deltaTime;

			// 1. Update Stopwatch
			if (_stopwatch.IsRunning)
			{
				_stopwatch.ElapsedTime += dt;
			}

			// 2. Update Timers
			for (int i = _activeTimers.Count - 1; i >= 0; i--)
			{
				var timer = _activeTimers[i];
				if (timer.IsRunning && !timer.IsFinished)
				{
					timer.RemainingTime -= dt;
					if (timer.RemainingTime <= 0)
					{
						timer.RemainingTime = 0;
						timer.IsFinished = true;
						timer.IsRunning = false;
						TriggerTimerFinished(timer);
					}
				}
			}

			// 3. Update Alarms (Low frequency check)
			_checkTimer += dt;
			if (_checkTimer >= 1.0f)
			{
				_checkTimer = 0;
				CheckAlarms();
			}
		}

		// --- Public API for UI ---
		public void StartTimer(float duration, string label = "Timer")
		{
			var timer = new TimerData
			{
				Label = label,
				Duration = duration,
				RemainingTime = duration,
				IsRunning = true
			};
			_activeTimers.Add(timer);
			Debug.Log($"[TimeModule] Started Timer: {label} ({duration}s)");
		}

		public void StopTimer(string id)
		{
			var timer = _activeTimers.Find(t => t.Id == id);
			if (timer != null)
			{
				timer.IsRunning = false;
				_activeTimers.Remove(timer);
			}
		}

		public void ToggleStopwatch(bool start)
		{
			_stopwatch.IsRunning = start;
		}

		public void ResetStopwatch()
		{
			_stopwatch.IsRunning = false;
			_stopwatch.ElapsedTime = 0f;
		}

		public float GetStopwatchTime() => _stopwatch.ElapsedTime;
		public List<TimerData> GetTimers() => _activeTimers;

		private void TriggerTimerFinished(TimerData timer)
		{
			Debug.Log($"[TimeModule] Timer Finished: {timer.Label}");

			// 2. Chat Notification (MDD Mode 🌸)
			if (_chatModule != null)
			{
				string[] moeMessages = new string[]
				{
					$"시간 다 됐어! ({timer.Label})", // Time's up!
					$"{timer.Label} 끝났어! 얼른 확인해봐!", // Finished! Check it out!
					"띠링띠링! 약속한 시간이야! ⏰", // Ring ring! It's the promised time!
					"일어나! (라고 하기엔 짧은가?)" // Wake up! (Too short?)
				};
				string msg = moeMessages[UnityEngine.Random.Range(0, moeMessages.Length)];

				_chatModule.ShowChat(msg, true); // Important
			}

			// 3. Event Notification (for Toast)
			OnTimerFinished?.Invoke($"Finished: {timer.Label}");

			// 2. Sound
			PlayProceduralBeep(0.8f); // High volume
		}

		public event System.Action<string> OnTimerFinished; // Important

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
				_chatModule.ShowChat(alarm.Message, true); // Important: Alarm must penetrate sleep
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
