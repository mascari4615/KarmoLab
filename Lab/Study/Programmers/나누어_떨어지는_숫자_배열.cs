using System;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
	public int[] solution(int[] arr, int divisor)
	{
		List<int> answer = new List<int>();
		for (int i = 0; i < arr.Length; i++)
		{
			if (arr[i] % divisor == 0)
				answer.Add(arr[i]);
		}
		answer.Sort();
		return answer.Count == 0 ? new int[] {-1} : answer.ToArray();
	}
}