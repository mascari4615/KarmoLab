using System;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
	public bool solution(string s)
	{
		Stack<char> stack = new Stack<char>();

		// 효율성 테스트 1 시간초과로 추가
		if (s.Length % 2 != 0 ||
			s.StartsWith(')') ||
			s.EndsWith('('))
		{
			return false;
		}

		for (int i = 0; i < s.Length; i++)
		{
			if (s[i] == '(')
				stack.Push(s[i]);
			else
			{
				if (stack.Count == 0)
					return false;

				if (stack.Peek() == '(')
					stack.Pop();
			}
		}

		return stack.Count == 0;
	}
}