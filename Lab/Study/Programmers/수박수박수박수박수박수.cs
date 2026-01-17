using System;
using System.Text;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
	public string solution(int n)
	{
		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < n / 2; i++)
			sb.Append("수박");
		return sb.ToString() + (n % 2 == 0 ? "" : "수");
	}
}