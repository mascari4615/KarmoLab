using System.Collections.Generic;
using UnityEngine;

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
			_speechBubble = new SpeechBubbleElement();
			_context.RootUI.Add(_speechBubble);

			// 2. Load Data
			_talkData = _context.Settings.CompanionData;

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
			_speechBubble.Hide();
		}

		public void ShowPersistentChat(string text)
		{
			_isPersistentBubble = true;
			// Pass a very long duration. 
			// The update loop logic will prevent hiding anyway because _isPersistentBubble is true.
			_speechBubble.Show(text, 99999f);
		}

		public void OnDestroy()
		{
			_speechBubble.RemoveFromHierarchy();
		}

		private void UpdateBubblePosition()
		{
			Vector3 headPos;
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
			float min = Mathf.Max(1f, _talkData.MinChatInterval);
			float max = Mathf.Max(min, _talkData.MaxChatInterval);
			float delay = Random.Range(min, max);

			if (delay < 1f) delay = 1f;

			_nextChatTime = Time.time + delay;
		}

		public void ShowRandomChat(List<string> options)
		{
			if (options == null || options.Count == 0)
				return;

			string text = options[Random.Range(0, options.Count)];
			ShowChat(text);
		}

		public void ShowChat(string text, bool isImportant = false)
		{
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
