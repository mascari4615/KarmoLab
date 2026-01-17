using System;
using System.Collections.Generic;

class Solution
{
   public int solution(int[] nums)
	{
		int count = 0;
		for (int i = 0; i < nums.Length - 2; i++)
		{
			for (int j = i + 1; j < nums.Length - 1; j++)
			{
				for (int k = j + 1; k < nums.Length; k++)
				{
					int num = nums[i] + nums[j] + nums[k];

					if (isPrime(num))
						count++;
				}
			}
		}

		return count;
	}

	private bool isPrime(int num)
	{
		int nr = (int)Math.Sqrt(num);
		for (int i = 2; i <= nr; i++)
		{
			if (num % i == 0)
				return false;
		}
		return true;
	}
}