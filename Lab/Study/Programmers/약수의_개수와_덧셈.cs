using System;

public class Solution
{
	public int solution(int left, int right)
	{
		int answer = 0;
		for (int i = left; i <= right; i++)
			answer += IsDivisorCountEven(i) ? i : -i;

		return answer;
	}

	private bool IsDivisorCountEven(int num)
	{
		int divisorCount = 0;
		for (int i = 1; i <= Math.Sqrt(num); i++)
		{
			if (num % i == 0)
			{
				divisorCount += i == Math.Sqrt(num) ? 1 : 2;
			}
		}
		Console.WriteLine(divisorCount);
		return divisorCount % 2 == 0;
	}
}