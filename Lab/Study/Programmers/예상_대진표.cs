using System;
using System.Collections.Generic;
using System.Linq;

class Solution
{
	public int solution(int n, int a, int b)
	{
		a--;
		b--;
		for (int i = 0; true; i++)
		{
			if ((a /= 2) == (b /= 2))
				return i + 1;
		}
	}

	// a = a / 2 + a % 2;
	// b = b / 2 + b % 2;
	// 이런 방법도 있네
}