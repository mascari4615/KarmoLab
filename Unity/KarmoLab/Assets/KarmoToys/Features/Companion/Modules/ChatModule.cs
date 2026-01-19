using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KarmoToys.Features.Companion;

namespace KarmoToys.Features.Companion.Modules
{
	public class ChatModule : ICompanionModule
	{
		private CompanionContext _context;
		private SpeechBubbleElement _speechBubble;
		private CompanionTalkData _talkData;
		private float _nextChatTime;
		private float _bubbleHideTime;
		private bool _isPersistentBubble; // If true, do not auto-hide

		public void Initialize(CompanionContext context)
		{
			_context = context;

			// 1. Setup UI
			if (_context.RootUI != null)
			{
				_speechBubble = new SpeechBubbleElement();
				_context.RootUI.Add(_speechBubble);
			}

			// 2. Load Data
			if (_context.Settings != null)
			{
				_talkData = _context.Settings.CompanionData;
			}

			if (_talkData == null)
			{
				Debug.LogError("[ChatModule] CompanionData is missing!");
				return;
			}

			// Safety checks
			if (_talkData.MinChatInterval < 0.5f) _talkData.MinChatInterval = 10f;
			if (_talkData.MaxChatInterval < _talkData.MinChatInterval) _talkData.MaxChatInterval = _talkData.MinChatInterval + 5f;

			ScheduleNextChat();
		}

		public void Update()
		{
			if (_talkData == null || _context.SelectedAvatar == null || _speechBubble == null) return;

			// 1. Position Update
			UpdateBubblePosition();

			// 2. Auto Chat Timer
			// Only chat if not dragging
			if (Time.time >= _nextChatTime && !_context.IsDragging && !_context.IsDragging3D)
			{
				ScheduleNextChat();
				ShowRandomChat(_talkData.IdleChats);
			}

			// 3. Hide Timer
			if (!_isPersistentBubble && _bubbleHideTime > 0 && Time.time >= _bubbleHideTime)
			{
				_speechBubble.Hide();
				_bubbleHideTime = 0;
			}
		}

		public void HidePersistentChat()
		{
			_isPersistentBubble = false;
			_bubbleHideTime = 0; // Hide immediately
			if (_speechBubble != null) _speechBubble.Hide();
		}

		public void ShowPersistentChat(string text)
		{
			if (_speechBubble == null) return;
			_isPersistentBubble = true;
			// Pass a very long duration. 
			// The update loop logic will prevent hiding anyway because _isPersistentBubble is true.
			_speechBubble.Show(text, 99999f);
		}

		public void OnDestroy()
		{
			if (_speechBubble != null)
			{
				_speechBubble.RemoveFromHierarchy();
			}
		}

		private void UpdateBubblePosition()
		{
			Vector3 headPos = Vector3.zero;
			if (_context.SelectedAvatar is CompanionCharacter cc)
			{
				headPos = cc.GetHeadPosition();
			}
			else
			{
				headPos = _context.SelectedAvatar.Transform.position + Vector3.up * 1.0f;
			}

			if (Camera.main != null)
			{
				Vector3 screenPos = Camera.main.WorldToScreenPoint(headPos);
				float uiY = Screen.height - screenPos.y;

				_speechBubble.style.left = screenPos.x;
				_speechBubble.style.top = uiY - 50;
			}
		}

		private void ScheduleNextChat()
		{
			if (_talkData == null) return;

			float min = Mathf.Max(1f, _talkData.MinChatInterval);
			float max = Mathf.Max(min, _talkData.MaxChatInterval);
			float delay = UnityEngine.Random.Range(min, max);

			if (delay < 1f) delay = 1f;

			_nextChatTime = Time.time + delay;
		}

		public void ShowRandomChat(List<string> options)
		{
			if (options == null || options.Count == 0) return;
			string text = options[UnityEngine.Random.Range(0, options.Count)];
			ShowChat(text);
		}

		public void ShowChat(string text, bool isImportant = false)
		{
			if (_speechBubble == null || _talkData == null) return;

			// Don't disturb sleep unless important
			if (_context.CurrentState == CompanionState.Sleeping && !isImportant)
			{
				return;
			}

			_speechBubble.Show(text, _talkData.BubbleDuration);
			_bubbleHideTime = Time.time + _talkData.BubbleDuration;
			_isPersistentBubble = false; // Reset persistence on normal chat
		}
	}
}
