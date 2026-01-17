using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public string solution(string phone_number)
		=> string.Concat(Enumerable.Repeat('*', phone_number.Length - 4)) + phone_number.Substring(phone_number.Length - 4);

	// PadLeft, PadRight 함수라는 게 있었구나
}