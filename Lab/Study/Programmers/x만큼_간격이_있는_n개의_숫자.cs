using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public long[] solution(int x, int n)
	{
		List<long> longs = new List<long>();
		for (int i = 0; i < n; i++)
			longs.Add((i - 1 >= 0 ? longs[i - 1] : 0) + x);
		return longs.ToArray();
	}
}