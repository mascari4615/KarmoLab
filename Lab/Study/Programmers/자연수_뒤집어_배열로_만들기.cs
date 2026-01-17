using System;
using System.Collections.Generic;

public class Solution
{
	public int[] solution(long n)
	{
		List<int> list = new List<int>();
		for (long i = n; i != 0; i /= 10)
			list.Add((int)(i % 10));
		return list.ToArray();
	}
}