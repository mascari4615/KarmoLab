using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public int[] solution(int[] arr)
	{
		List<int> list = arr.ToList();
		list.Remove(list.Min());
		return list.Count == 0 ? new int[] { -1 } : list.ToArray();
	}
}