using System;
using System.Text;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public int solution(string s)
	{
		if (s.Length % 2 != 0)
			return 0;

		int answer = 0;
		StringBuilder sb = new StringBuilder(s);
		for (int i = 0; i < s.Length; i++)
		{
			if (IsCorrectBracketString(sb.ToString()))
				answer++;

			sb.Append(sb[0]);
			sb.Remove(0, 1);
		}
		return answer;
	}

	private bool IsCorrectBracketString(string s)
	{
		if (s.StartsWith(")") || s.StartsWith("]") || s.StartsWith("}") ||
			s.EndsWith("(") || s.EndsWith("[") || s.EndsWith("{"))
			return false;

		Stack<char> ss = new Stack<char>();

		for (int i = 0; i < s.Length; i++)
		{
			if (ss.Count > 0)
			{
				if (ss.Peek() - s[i] == -1 || ss.Peek() - s[i] == -2)
					ss.Pop();
				else
					ss.Push(s[i]);
			}
			else
			{
				ss.Push(s[i]);
				if (ss.Peek().Equals(")") || ss.Peek().Equals("]") || ss.Peek().Equals("}"))
					return false;
			}
		}

		return ss.Count == 0;
	}

    // While Contains("괄호") Replace("괄호", "") 이런 식으로 푸는 거 보고 놀람
}