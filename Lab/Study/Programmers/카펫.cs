using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public int[] solution(int brown, int yellow)
	{
		for (int i = 1; true; i++)
		{
			if (yellow % i != 0)
				continue;

			if ((yellow / i + 2) * (i + 2) == brown + yellow)
				return new int[] { Math.Max(yellow / i + 2, i + 2), Math.Min(yellow / i + 2, i + 2) };
		}
	}
}