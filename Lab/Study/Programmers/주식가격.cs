using System;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
    // 스택써도 똑같은 것 같은데,
    // 왜 '스택/큐' 문제로 분류되어 있지
	public int[] solution(int[] prices)
	{
		List<int> results = new List<int>();
		for (int i = 0; i < prices.Length; i++)
		{
			int noDownCount = 0;
			for (int j = i + 1; j < prices.Length; j++)
			{
				noDownCount++;
				if (prices[i] > prices[j])
					break;
			}
			results.Add(noDownCount);
		}

		return results.ToArray();
	}
}