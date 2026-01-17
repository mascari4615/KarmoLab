using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public int[] solution(string s)
	{
		int[] answer = new int[2] { 0, 0 };
		while (s != "1")
		{
			int zeroCount = s.Count(x => x == '0');
			answer[0]++;
			answer[1] += zeroCount;
			s = Convert.ToString(s.Length - zeroCount, 2);
		}
		return answer;

		// 진수 변환 Convert.ToString
	}
}