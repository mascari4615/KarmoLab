using System;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
	public long solution(int price, int money, int count)
	{
		long moneyL = money;
		for (int i = 1; i <= count; i++)
			moneyL -= price * i;

		return moneyL > 0 ? 0 : Math.Abs(moneyL);
	}
}