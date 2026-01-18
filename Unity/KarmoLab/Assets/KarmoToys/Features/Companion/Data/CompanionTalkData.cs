using System.Collections.Generic;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace KarmoToys.Features.Companion
{
	[CreateAssetMenu(fileName = "CompanionTalkData", menuName = "KarmoLab/KarmoToys/Companion Talk Data")]
	public class CompanionTalkData : ScriptableObject
	{
		[Header("💬 Idle Chatter")]
		[Tooltip("가만히 있을 때 랜덤하게 하는 혼잣말")]
		public List<string> IdleChats = new List<string>();

		[Header("👆 Interactions")]
		[Tooltip("클릭했을 때 반응")]
		public List<string> ClickReactions = new List<string>();

		[Tooltip("드래그 시작할 때 반응")]
		public List<string> DragStartReactions = new List<string>();

		[Tooltip("드래그 끝났을 때 반응")]
		public List<string> DragEndReactions = new List<string>();

		[Header("⚙️ Settings")]
		[Tooltip("혼잣말 최소 간격 (초)")]
		public float MinChatInterval = 10f;

		[Tooltip("혼잣말 최대 간격 (초)")]
		public float MaxChatInterval = 30f;

		[Tooltip("말풍선 떠있는 시간 (초)")]
		public float BubbleDuration = 3f;

		private void Reset()
		{
			SetDefaultData();
		}

		public void SetDefaultData()
		{
			IdleChats = new List<string> { "심심해...", "놀아줘!", "Zzz...", "배고프당", "작업 파이팅!" };
			ClickReactions = new List<string> { "냐앙?", "왜?", "간지러!", "히히" };
			DragStartReactions = new List<string> { "으아앙!", "어디가!", "날고있어!", "잡혀따!" };
			DragEndReactions = new List<string> { "휴...", "도착!", "어질어질해", "쿵!" };

			MinChatInterval = 10f;
			MaxChatInterval = 30f;
			BubbleDuration = 3f;
		}

#if UNITY_EDITOR
		[MenuItem("KarmoLab/KarmoToys/Open Companion Talk Data")]
		public static void OpenStats()
		{
			var asset = Resources.Load<CompanionTalkData>("CompanionTalkData");
			if (asset == null)
			{
				// Find anywhere in assets
				string[] guids = AssetDatabase.FindAssets("t:CompanionTalkData");
				if (guids.Length > 0)
				{
					string path = AssetDatabase.GUIDToAssetPath(guids[0]);
					asset = AssetDatabase.LoadAssetAtPath<CompanionTalkData>(path);
				}
			}

			if (asset != null)
			{
				Selection.activeObject = asset;
			}
			else
			{
				// Optional: Ask to create? Or just log
				Debug.LogWarning("CompanionTalkData asset not found. Please create one using Create > KarmoLab > KarmoToys > Companion Talk Data");
			}
		}
#endif
	}
}
