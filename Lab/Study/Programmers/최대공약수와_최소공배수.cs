using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public int[] solution(int n, int m)
	{
		int big = m, small = n, remainder = 0;

		while (big % small != 0)
		{
			remainder = big % small;
			big = small;
			small = remainder;
		}

		return remainder == 0 ? new int[] { n, m } : new int[] { remainder, n * m / remainder };
	}

	// 유클리드 호제법..? 수학 다 까먹었다
}