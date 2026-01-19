using UnityEngine;

namespace KarmoToys.Features.Companion.Modules
{
	public class IdleMonitorModule : ICompanionModule
	{
		private CompanionContext _context;
		private ChatModule _chatModule;

		private float _idleThreshold = 10f; // 10 seconds to sleep (for testing)
		private bool _isSleeping = false;

		private const string SleepMessage = "Zzz...";
		private const string WakeMessage = "Hot!"; // "헛!" (Surprised)

		public void Initialize(CompanionContext context)
		{
			_context = context;
			// Todo: Load threshold from settings
		}

		public void SetChatModule(ChatModule chatModule)
		{
			_chatModule = chatModule;
		}

		public void Update()
		{
#if UNITY_EDITOR
			// In Editor, we need to manually update the mock idle timer
			WindowTransparencyUtils.UpdateEditorIdle();
#endif

			float idleSeconds = WindowTransparencyUtils.GetIdleTimeSeconds();

			if (!_isSleeping)
			{
				if (idleSeconds >= _idleThreshold)
				{
					EnterSleepMode();
				}
			}
			else
			{
				if (idleSeconds < 1.0f) // Input detected (idle time reset)
				{
					ExitSleepMode();
				}
				else
				{
					// Stay sleeping... maybe periodic snoring?
					// Or trigger specific interaction/anim
				}
			}
		}

		private void EnterSleepMode()
		{
			_isSleeping = true;
			_context.CurrentState = CompanionState.Sleeping;
			Debug.Log("[IdleMonitor] Entering Sleep Mode (Zzz)");

			// 1. Chat: Persistent Zzz
			if (_chatModule != null)
			{
				_chatModule.ShowPersistentChat(SleepMessage);
			}

			// 2. Avatar: Sleep Animation
			if (_context.SelectedAvatar is CompanionCharacter character)
			{
				character.SetSleepMode(true);
				Debug.Log($"[IdleMonitor] Sleep Mode set for {character.name}");
			}
			else
			{
				Debug.LogWarning($"[IdleMonitor] SelectedAvatar is not CompanionCharacter ({_context.SelectedAvatar?.GetType().Name})");
			}
		}

		private void ExitSleepMode()
		{
			_isSleeping = false;
			_context.CurrentState = CompanionState.Normal;
			Debug.Log("[IdleMonitor] Waking Up!");

			// 1. Chat: Restore normal chat
			if (_chatModule != null)
			{
				_chatModule.HidePersistentChat();
				_chatModule.ShowChat(WakeMessage, true); // Important: Notify wake up
			}

			// 2. Avatar: Wake up
			if (_context.SelectedAvatar is CompanionCharacter character)
			{
				character.SetSleepMode(false);
				Debug.Log($"[IdleMonitor] Wake up set for {character.name}");
			}
		}

		public void OnDestroy()
		{
			_isSleeping = false;
		}
	}
}
