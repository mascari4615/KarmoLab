using System;
using System.Collections;
using System.Collections.Generic;

public class Solution
{
	public int[] solution(int[] numbers)
	{
		List<int> answer = new List<int>();

		for (int i = 0; i < numbers.Length - 1; i++)
		{
			for (int j = i + 1; j < numbers.Length; j++)
			{
				if (!answer.Contains(numbers[i] + numbers[j]))
					answer.Add(numbers[i] + numbers[j]);
			}
		}
		answer.Sort();
		return answer.ToArray();
	}
}