using System;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
	public string solution(string[] survey, int[] choices)
	{
		string answer = "";
		Dictionary<char, int> map = new Dictionary<char, int> ()
		{
			{ 'R', 0 },
			{ 'T', 0 },
			{ 'C', 0 },
			{ 'F', 0 },
			{ 'J', 0 },
			{ 'M', 0 },
			{ 'A', 0 },
			{ 'N', 0 },
		};

		for (int i = 0; i < survey.Length; i++)
		{
			int choice = choices[i] - 4;
			map[survey[i][choice > 0 ? 1 : 0]] += Math.Abs(choice);
		}

		answer += map['R'] >= map['T'] ? 'R' : 'T';
		answer += map['C'] >= map['F'] ? 'C' : 'F';
		answer += map['J'] >= map['M'] ? 'J' : 'M';
		answer += map['A'] >= map['N'] ? 'A' : 'N';
		return answer;
	}
}