using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public int solution(int n)
	{
		int oneCount = Convert.ToString(n, 2).Count(x => x == '1');
		for (int i = n + 1; true; i++)
		{
			if (Convert.ToString(i, 2).Count(x => x == '1') == oneCount)
				return i;
		}
	}

	// System.Text.RegularExpressions에 들어있는 Regex.Matches(문자열).Count 이라는 것도 있다

	// '대량의 문자열 데이터에서 특정 패턴을 찾아내거나, 특정 문자열을 치환하는 들의 일을 쉽게 할 수 있다'
	// By 예제로 배우는 C# 프로그래밍 -> https://www.csharpstudy.com/Practical/Prac-regex-1.aspx
}