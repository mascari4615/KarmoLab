using System;
using System.Collections.Generic;
using UnityEngine;

namespace KarmoToys.Features.Companion.Data
{
	[Serializable]
	public class KeyDefinition
	{
		public string Label;        // 표시할 텍스트 (예: "Hb", "Esc")
		public int VkCode;          // Win32 Virtual Key Code
		public float Width = 1.0f;  // 1U 기준 너비 (예: Space=6.25)
		public float SpacingLeft = 0f; // 왼쪽 여백 (1U 기준)
		public string CssClass;     // 추가 스타일 클래스 (예: "iso-enter")
		
		// 런타임 식별용 (필요 시)
		public bool IsModifier;
	}

	[Serializable]
	public class KeyboardRow
	{
		public float Height = 1.0f; // 1U 기준 높이
		public float MarginBottom = 0f;
		public List<KeyDefinition> Keys = new List<KeyDefinition>();
	}

	[CreateAssetMenu(fileName = "NewKeyboardLayout", menuName = "KarmoToys/Companion/KeyboardLayoutData")]
	public class KeyboardLayoutData : ScriptableObject
	{
		public string LayoutName = "ANSI 104";
		public string Description = "Standard ANSI 104-key layout";
		
		[Header("Layout Configuration")]
		public float BaseKeySize = 50f; // 1U의 픽셀 크기 (UI 생성 시 기준)
		public float KeySpacing = 4f;   // 키 간격 (픽셀)
		
		public List<KeyboardRow> Rows = new List<KeyboardRow>();
		
		/// <summary>
		/// 특정 VkCode를 가진 키 정의를 찾습니다. (O(N) 탐색, 런타임에는 캐싱 권장)
		/// </summary>
		public KeyDefinition FindKey(int vkCode)
		{
			foreach (var row in Rows)
			{
				foreach (var key in row.Keys)
				{
					if (key.VkCode == vkCode) return key;
				}
			}
			return null;
		}
	}
}
