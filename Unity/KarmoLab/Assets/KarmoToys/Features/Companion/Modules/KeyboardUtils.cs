using System;
using UnityEngine;

namespace KarmoToys.Features.Companion.Modules
{
	public static class KeyboardUtils
	{
		public static int TranslateUnityKeyToVkCode(KeyCode key)
		{
			// Basic mapping for common keys
			int k = (int)key;
			if (k >= (int)KeyCode.A && k <= (int)KeyCode.Z) return k - 32; // 'a'(97) -> 'A'(65)
			if (k >= (int)KeyCode.Alpha0 && k <= (int)KeyCode.Alpha9) return k; // 0-9 match
			if (k >= (int)KeyCode.F1 && k <= (int)KeyCode.F12) return 112 + (k - (int)KeyCode.F1); // F1(282) -> 112

			switch (key)
			{
				case KeyCode.Backspace: return 0x08;
				case KeyCode.Tab: return 0x09;
				case KeyCode.Return: case KeyCode.KeypadEnter: return 0x0D;
				case KeyCode.LeftShift: case KeyCode.RightShift: return 0x10; // Simple mapping
				case KeyCode.LeftControl: case KeyCode.RightControl: return 0x11;
				case KeyCode.LeftAlt: case KeyCode.RightAlt: return 0x12;
				case KeyCode.CapsLock: return 0x14;
				case KeyCode.Escape: return 0x1B;
				case KeyCode.Space: return 0x20;
				case KeyCode.PageUp: return 0x21;
				case KeyCode.PageDown: return 0x22;
				case KeyCode.End: return 0x23;
				case KeyCode.Home: return 0x24;
				case KeyCode.LeftArrow: return 0x25;
				case KeyCode.UpArrow: return 0x26;
				case KeyCode.RightArrow: return 0x27;
				case KeyCode.DownArrow: return 0x28;
				case KeyCode.Insert: return 0x2D;
				case KeyCode.Delete: return 0x2E;
				case KeyCode.Semicolon: return 186;
				case KeyCode.Equals: return 187; // +
				case KeyCode.Comma: return 188;
				case KeyCode.Minus: return 189;
				case KeyCode.Period: return 190;
				case KeyCode.Slash: return 191;
				case KeyCode.BackQuote: return 192; // ~
				case KeyCode.LeftBracket: return 219;
				case KeyCode.Backslash: return 220;
				case KeyCode.RightBracket: return 221;
				case KeyCode.Quote: return 222;
			}
			return 0;
		}

		public static string GetKeyName(int vkCode)
		{
			switch (vkCode)
			{
				case 0x08: return "Back";
				case 0x09: return "Tab";
				case 0x0D: return "Enter";
				case 0x10: case 0xA0: case 0xA1: return "Shift";
				case 0x11: case 0xA2: case 0xA3: return "Ctrl";
				case 0x12: case 0xA4: case 0xA5: return "Alt";
				case 0x14: return "Caps";
				case 0x15: return "한/영";
				case 0x19: return "한자";
				case 0x1B: return "Esc";
				case 0x20: return "Space";
				case 0x2E: return "Del";
				case 0x21: return "PgUp";
				case 0x22: return "PgDn";
				case 0x23: return "End";
				case 0x24: return "Home";
				case 0x25: return "←";
				case 0x26: return "↑";
				case 0x27: return "→";
				case 0x28: return "↓";
				case 0x2C: return "PrtSc";
				case 0x2D: return "Ins";
				case 0x5B: case 0x5C: return "Win";
				// Symbols
				case 186: return ";";
				case 187: return "=";
				case 188: return ",";
				case 189: return "-";
				case 190: return ".";
				case 191: return "/";
				case 192: return "`";
				case 219: return "[";
				case 220: return "\\";
				case 221: return "]";
				case 222: return "'";

				// F-Keys
				case int n when (n >= 112 && n <= 123): return "F" + (n - 111);
			}
			// Fallback for letters/numbers
			if ((vkCode >= 65 && vkCode <= 90) || (vkCode >= 48 && vkCode <= 57))
			{
				return ((char)vkCode).ToString();
			}
			return "K" + vkCode;
		}
	}
}
