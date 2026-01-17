using System;
using System.Collections.Generic;

public class Solution
{
	public int solution(int n)
	{
		int answer = 0;
		List<int> result = new List<int>();

		for (int i = n; i != 0; i /= 3)
			result.Add(i % 3);

		result.Reverse();

		for (int i = 0; i < result.Count; i++)
			answer += (int)Math.Pow(3, i) * result[i];

		return answer;
	}
}