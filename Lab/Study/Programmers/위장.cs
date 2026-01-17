using System;
using System.Linq;
using System.Collections;
using System.Collections.Generic;

public class Solution
{
	public int solution(string[,] clothes)
	{
		Dictionary<string, int> table = new Dictionary<string, int>();
		int answer = 1;

		for (int i = 0; i < clothes.GetLength(0); i++)
		{
			if (!table.ContainsKey(clothes[i, 1]))
				table.Add(clothes[i, 1], 0);

			table[clothes[i, 1]]++;
		}

		foreach (var keyValuePair in table)
		{
			answer *= keyValuePair.Value + 1;
		}

		return answer - 1;
	}
}