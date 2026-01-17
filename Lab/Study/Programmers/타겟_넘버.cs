using System;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
	public int solution(int[] numbers, int target)
	{
		return Recursive(0, numbers, 0, 0, target);
	}

	private int Recursive(int answerCount, int[] numbers, int index, int sum, int target)
	{
		if (index == numbers.Length)
		{
			if (sum == target)
				answerCount++;
		}
		else
		{
			answerCount = Recursive(answerCount, numbers, index + 1, sum + numbers[index], target);
			answerCount = Recursive(answerCount, numbers, index + 1, sum - numbers[index], target);
		}

		return answerCount;
	}
}