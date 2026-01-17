using System;
using System.Collections;
using System.Collections.Generic;

public class Solution
{
	public string solution(int a, int b)
	{
		string[] dayName = { "FRI", "SAT", "SUN", "MON", "TUE", "WED", "THU" };
		int[] dayCount = { 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };

		int day = b;

		if (a != 1)
			for (int i = 0; i < a - 1; i++)
				day += dayCount[i];

		day--;
		day %= 7;

		return dayName[day];
	}
}