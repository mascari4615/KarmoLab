using System;
using System.Collections.Generic;
using System.Linq;

class Solution
{
	public int solution(int[] arr)
	{
		for (int i = arr[0]; true; i += arr[0])
		{
			for (int j = 1; j < arr.Length; j++)
			{
				if ((i % arr[j] != 0) || i < arr[j])
					break;

				if (j == arr.Length - 1)
					return i;
			}
		}
	}

	// 유클리드 호제법 안쓰고도 풀 수는 있는데..
	// 다시 공부해야겠다
}