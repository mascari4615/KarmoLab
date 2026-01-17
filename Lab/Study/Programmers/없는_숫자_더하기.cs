using System;

public class Solution
{
	public int solution(int[] numbers)
	{
		int answer = 0;
		bool[] numExist = new bool[10];

		foreach (var num in numbers)
			numExist[num] = true;

		for (int i = 0; i < 10; i++)
		{
			if (numExist[i] == false)
				answer += i;
		}
		return answer;
	}
}