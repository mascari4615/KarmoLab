using System;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
	public int solution(int n)
	{
		List<int> results = new List<int>();
		for (int i = 2; i <= n; i++)
		{
			if (IsPrime(i))
				results.Add(i);
		}
		return results.Count;
	}

    // 외워야겠음
	// https://stackoverflow.com/questions/15743192/check-if-number-is-prime-number
	public bool IsPrime(int number)
	{
		if (number <= 1) return false;
		if (number == 2) return true;
		if (number % 2 == 0) return false;

		var boundary = (int)Math.Floor(Math.Sqrt(number));

		for (int i = 3; i <= boundary; i += 2)
			if (number % i == 0)
				return false;

		return true;
	}
}