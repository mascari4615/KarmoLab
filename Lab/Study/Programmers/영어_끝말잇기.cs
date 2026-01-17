using System;
using System.Collections.Generic;
using System.Linq;

class Solution
{
	public int[] solution(int n, string[] words)
	{
		List<string> usedWords = new List<string>();

		usedWords.Add(words[0]);
		for (int i = 1; i < words.Length; i++)
		{
			if ((words[i].First() != words[i - 1].Last()) || usedWords.Contains(words[i]))
				return new int[] { 1 + i % n, 1 + i / n };

			usedWords.Add(words[i]);
		}

		return new int[] { 0, 0 };
	}

	// 반환 값 계산에서 잠시 버벅였다..
}