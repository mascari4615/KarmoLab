using System;
using System.Linq;
using System.Collections;
using System.Collections.Generic;

public class Solution
{
	public int[] solution(int[] answers)
	{
		int[] num1AnswerPattern = { 1, 2, 3, 4, 5 };
		int[] num2AnswerPattern = { 2, 1, 2, 3, 2, 4, 2, 5 };
		int[] num3AnswerPattern = { 3, 3, 1, 1, 2, 2, 4, 4, 5, 5 };

		int[] score = new int[3];

		for (int i = 0; i < answers.Length; i++)
		{
			if (answers[i] == num1AnswerPattern[i % 5])
				score[0]++;

			if (answers[i] == num2AnswerPattern[i % 8])
				score[1]++;

			if (answers[i] == num3AnswerPattern[i % 10])
				score[2]++;
		}

		int biggest = score.Max();
		List<int> ints = new List<int>();

		for (int i = 0; i < 3; i++)
		{
			if (score[i] == biggest)
				ints.Add(i + 1);
		}
		return ints.ToArray();
	}
}