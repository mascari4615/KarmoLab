using System;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;

namespace KarmoLab
{
	public partial class TextFormatManager : ButtonContent
	{
		// 고유한 문자만 추출하는 기능
		public void UniqueCharacters(string text)
		{
			MLog.Log($"{nameof(UniqueCharacters)} is called.");

			string uniqueCharacters = GetAllUniqueCharacters(text);
			MLog.Log($"Unique Characters: {uniqueCharacters}");
			inputFieldOutput.text = uniqueCharacters;
		}

		public static string GetAllUniqueCharacters(string input)
		{
			if (string.IsNullOrEmpty(input))
				return string.Empty;

			return string.Concat(input.Distinct().OrderBy(c => c));
		}
	}
}