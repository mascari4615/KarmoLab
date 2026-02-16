using System.Collections.Generic;
using UnityEngine;

namespace KarmoToys.Features.Companion.Data
{
	public static class KeyboardLayoutBuilder
	{
		public static KeyboardLayoutData CreateDefaultAnsi104()
		{
			var data = ScriptableObject.CreateInstance<KeyboardLayoutData>();
			data.LayoutName = "Standard ANSI 104";
			data.BaseKeySize = 50f;
			data.KeySpacing = 4f;

			// --- Row 1 (Function Keys) ---
			var r1 = new KeyboardRow { Height = 1.0f, MarginBottom = 0.5f };
			r1.Keys.Add(Key("Esc", 27));
			r1.Keys.Add(Key("F1", 112, spacingLeft: 1.0f));
			r1.Keys.Add(Key("F2", 113));
			r1.Keys.Add(Key("F3", 114));
			r1.Keys.Add(Key("F4", 115));
			r1.Keys.Add(Key("F5", 116, spacingLeft: 0.5f));
			r1.Keys.Add(Key("F6", 117));
			r1.Keys.Add(Key("F7", 118));
			r1.Keys.Add(Key("F8", 119));
			r1.Keys.Add(Key("F9", 120, spacingLeft: 0.5f));
			r1.Keys.Add(Key("F10", 121));
			r1.Keys.Add(Key("F11", 122));
			r1.Keys.Add(Key("F12", 123));
			// Print, Scroll, Pause
			r1.Keys.Add(Key("Prt", 44, spacingLeft: 0.5f));
			r1.Keys.Add(Key("Scr", 145));
			r1.Keys.Add(Key("Pau", 19));
			data.Rows.Add(r1);

			// --- Row 2 (Number Row) ---
			var r2 = new KeyboardRow();
			r2.Keys.Add(Key("`", 192));
			r2.Keys.Add(Key("1", 49));
			r2.Keys.Add(Key("2", 50));
			r2.Keys.Add(Key("3", 51));
			r2.Keys.Add(Key("4", 52));
			r2.Keys.Add(Key("5", 63));
			r2.Keys.Add(Key("6", 54));
			r2.Keys.Add(Key("7", 55));
			r2.Keys.Add(Key("8", 56));
			r2.Keys.Add(Key("9", 57));
			r2.Keys.Add(Key("0", 48));
			r2.Keys.Add(Key("-", 189));
			r2.Keys.Add(Key("=", 187));
			r2.Keys.Add(Key("Back", 8, width: 2.0f));
			// Ins, Home, PgUp
			r2.Keys.Add(Key("Ins", 45, spacingLeft: 0.5f));
			r2.Keys.Add(Key("Hom", 36));
			r2.Keys.Add(Key("PgU", 33));
			// NumLock, /, *, -
			r2.Keys.Add(Key("Num", 144, spacingLeft: 0.5f));
			r2.Keys.Add(Key("/", 111));
			r2.Keys.Add(Key("*", 106));
			r2.Keys.Add(Key("-", 109));
			data.Rows.Add(r2);

			// --- Row 3 (Tab, QWERTY) ---
			var r3 = new KeyboardRow();
			r3.Keys.Add(Key("Tab", 9, width: 1.5f));
			r3.Keys.Add(Key("Q", 81));
			r3.Keys.Add(Key("W", 87));
			r3.Keys.Add(Key("E", 69));
			r3.Keys.Add(Key("R", 82));
			r3.Keys.Add(Key("T", 84));
			r3.Keys.Add(Key("Y", 89));
			r3.Keys.Add(Key("U", 85));
			r3.Keys.Add(Key("I", 73));
			r3.Keys.Add(Key("O", 79));
			r3.Keys.Add(Key("P", 80));
			r3.Keys.Add(Key("[", 219));
			r3.Keys.Add(Key("]", 221));
			r3.Keys.Add(Key("\\", 220, width: 1.5f));
			// Del, End, PgDn
			r3.Keys.Add(Key("Del", 46, spacingLeft: 0.5f));
			r3.Keys.Add(Key("End", 35));
			r3.Keys.Add(Key("PgD", 34));
			// 7, 8, 9, +
			r3.Keys.Add(Key("7", 103, spacingLeft: 0.5f));
			r3.Keys.Add(Key("8", 104));
			r3.Keys.Add(Key("9", 105));
			r3.Keys.Add(Key("+", 107)); // Height usually 2U, handled later or split
			data.Rows.Add(r3);

			// --- Row 4 (Caps, ASDF) ---
			var r4 = new KeyboardRow();
			r4.Keys.Add(Key("Caps", 20, width: 1.75f));
			r4.Keys.Add(Key("A", 65));
			r4.Keys.Add(Key("S", 83));
			r4.Keys.Add(Key("D", 68));
			r4.Keys.Add(Key("F", 70));
			r4.Keys.Add(Key("G", 71));
			r4.Keys.Add(Key("H", 72));
			r4.Keys.Add(Key("J", 74));
			r4.Keys.Add(Key("K", 75));
			r4.Keys.Add(Key("L", 76));
			r4.Keys.Add(Key(";", 186));
			r4.Keys.Add(Key("'", 222));
			r4.Keys.Add(Key("Enter", 13, width: 2.25f, cssClass: "enter"));
			// Empty space for nav block
			r4.Keys.Add(Key("", 0, width: 3.5f, cssClass: "spacer")); // spacer
			// 4, 5, 6
			r4.Keys.Add(Key("4", 100)); // Numpad
			r4.Keys.Add(Key("5", 101));
			r4.Keys.Add(Key("6", 102));
			// + cont. (simulated)
			data.Rows.Add(r4);

			// --- Row 5 (Shift, ZXCV) ---
			var r5 = new KeyboardRow();
			r5.Keys.Add(Key("Shift", 160, width: 2.25f, isModifier: true)); // LShift
			r5.Keys.Add(Key("Z", 90));
			r5.Keys.Add(Key("X", 88));
			r5.Keys.Add(Key("C", 67));
			r5.Keys.Add(Key("V", 86));
			r5.Keys.Add(Key("B", 66));
			r5.Keys.Add(Key("N", 78));
			r5.Keys.Add(Key("M", 77));
			r5.Keys.Add(Key(",", 188));
			r5.Keys.Add(Key(".", 190));
			r5.Keys.Add(Key("/", 191));
			r5.Keys.Add(Key("Shift", 161, width: 2.75f, isModifier: true)); // RShift
			// Up Arrow
			r5.Keys.Add(Key("↑", 38, spacingLeft: 1.5f));
			// 1, 2, 3, Enter
			r5.Keys.Add(Key("1", 97, spacingLeft: 1.5f)); // Numpad
			r5.Keys.Add(Key("2", 98));
			r5.Keys.Add(Key("3", 99));
			r5.Keys.Add(Key("Ent", 13)); // Numpad Enter (usually vertical 2U)
			data.Rows.Add(r5);

			// --- Row 6 (Ctrl, Win, Alt, Space) ---
			var r6 = new KeyboardRow();
			r6.Keys.Add(Key("Ctrl", 162, width: 1.25f, isModifier: true)); // LCtrl
			r6.Keys.Add(Key("Win", 91, width: 1.25f, isModifier: true)); // LWin
			r6.Keys.Add(Key("Alt", 164, width: 1.25f, isModifier: true)); // LAlt
			r6.Keys.Add(Key("Space", 32, width: 6.25f));
			r6.Keys.Add(Key("한/영", 21, width: 1.25f)); // Hangul (Right Alt)
			r6.Keys.Add(Key("Win", 92, width: 1.25f, isModifier: true)); // RWin
			r6.Keys.Add(Key("Menu", 93, width: 1.25f));
			r6.Keys.Add(Key("한자", 25, width: 1.25f)); // Hanja (Right Ctrl)
			// Left, Down, Right
			r6.Keys.Add(Key("←", 37, spacingLeft: 0.5f));
			r6.Keys.Add(Key("↓", 40));
			r6.Keys.Add(Key("→", 39));
			// 0, .
			r6.Keys.Add(Key("0", 96, width: 2.0f, spacingLeft: 0.5f)); // Numpad
			r6.Keys.Add(Key(".", 110)); // Numpad
			data.Rows.Add(r6);

			return data;
		}

		public static KeyboardLayoutData CreateGameWasd()
		{
			var data = ScriptableObject.CreateInstance<KeyboardLayoutData>();
			data.LayoutName = "Game WASD";
			data.BaseKeySize = 60f;
			data.KeySpacing = 5f;

			// Row 1: 1 2 3 4
			var r1 = new KeyboardRow();
			r1.Keys.Add(Key("1", 49));
			r1.Keys.Add(Key("2", 50));
			r1.Keys.Add(Key("3", 51));
			r1.Keys.Add(Key("4", 52));
			r1.Keys.Add(Key("5", 53));
			data.Rows.Add(r1);

			// Row 2: Tab Q W E R
			var r2 = new KeyboardRow();
			r2.Keys.Add(Key("Tab", 9, width: 1.5f));
			r2.Keys.Add(Key("Q", 81));
			r2.Keys.Add(Key("W", 87));
			r2.Keys.Add(Key("E", 69));
			r2.Keys.Add(Key("R", 82));
			r2.Keys.Add(Key("T", 84));
			data.Rows.Add(r2);

			// Row 3: Caps A S D F
			var r3 = new KeyboardRow();
			r3.Keys.Add(Key("Caps", 20, width: 1.75f));
			r3.Keys.Add(Key("A", 65));
			r3.Keys.Add(Key("S", 83));
			r3.Keys.Add(Key("D", 68));
			r3.Keys.Add(Key("F", 70));
			r3.Keys.Add(Key("G", 71));
			data.Rows.Add(r3);

			// Row 4: Shift Z X C V
			var r4 = new KeyboardRow();
			r4.Keys.Add(Key("Shift", 160, width: 2.25f, isModifier: true));
			r4.Keys.Add(Key("Z", 90));
			r4.Keys.Add(Key("X", 88));
			r4.Keys.Add(Key("C", 67));
			r4.Keys.Add(Key("V", 86));
			r4.Keys.Add(Key("B", 66));
			data.Rows.Add(r4);

			// Row 5: Ctrl Space
			var r5 = new KeyboardRow();
			r5.Keys.Add(Key("Ctrl", 162, width: 1.5f, isModifier: true));
			r5.Keys.Add(Key("Space", 32, width: 4.5f));
			data.Rows.Add(r5);

			return data;
		}

		public static KeyboardLayoutData CreateLolMoba()
		{
			var data = ScriptableObject.CreateInstance<KeyboardLayoutData>();
			data.LayoutName = "MOBA (QWER)";
			data.BaseKeySize = 80f; // Larger keys
			data.KeySpacing = 10f;

			// Row 1: Items (1-6) - Simplified to 1-4
			var r1 = new KeyboardRow { MarginBottom = 0.5f };
			r1.Keys.Add(Key("1", 49));
			r1.Keys.Add(Key("2", 50));
			r1.Keys.Add(Key("3", 51));
			r1.Keys.Add(Key("4", 52)); // Ward
			data.Rows.Add(r1);

			// Row 2: Skills (Q W E R)
			var r2 = new KeyboardRow { MarginBottom = 0.5f };
			r2.Keys.Add(Key("Q", 81));
			r2.Keys.Add(Key("W", 87));
			r2.Keys.Add(Key("E", 69));
			r2.Keys.Add(Key("R", 82));
			data.Rows.Add(r2);

			// Row 3: Spells (D F) + A S
			var r3 = new KeyboardRow();
			r3.Keys.Add(Key("D", 68));
			r3.Keys.Add(Key("F", 70));
			r3.Keys.Add(Key("B", 66, spacingLeft: 0.5f)); // Recall
			r3.Keys.Add(Key("P", 80)); // Shop
			data.Rows.Add(r3);
			return data;
		}

		private static KeyDefinition Key(string label, int vk, float width = 1.0f, float spacingLeft = 0f, string cssClass = "", bool isModifier = false)
		{
			return new KeyDefinition
			{
				Label = label,
				VkCode = vk,
				Width = width,
				SpacingLeft = spacingLeft,
				CssClass = cssClass,
				IsModifier = isModifier
			};
		}
	}
}
