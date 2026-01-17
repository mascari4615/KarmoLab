using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public int solution(int num)
	{
		if (num == 1) return 0;

		int count = 0;
		while (count < 500 && num != 1)
		{
			if (num % 2 == 0)
				num /= 2;
			else if (num % 2 == 1)
				num = num * 3 + 1;

			count++;
		}
		return count >= 500 ? -1 : count;
	}
}