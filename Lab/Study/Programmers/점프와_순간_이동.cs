using System;
using System.Collections.Generic;
using System.Linq;

class Solution
{
	public int solution(int n)
	{
		int answer = 0;
		while (n != 0)
		{
			if (n % 2 == 0)
				n /= 2;
			else
			{
				n--;
				answer++;
			}
		}
		return answer;
	}

	// while (n != 0)
	// {
	//		answer += n % 2;   
	//		n /= 2;
	// }
	// return answer;

	// 이게 더 깔끔하네
	// 굳이 짝수인지 판단할 필요 없이 % 2 더하면 되는구나
}