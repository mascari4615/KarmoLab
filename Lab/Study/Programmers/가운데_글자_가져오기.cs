using System;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
	public string solution(string s)
	{
		// return s[ .. ].ToString();
		// 위 문법은 버전 8 부터 지원 (문제의 컴파일 버전은 6)

		return (s.Length % 2 == 1)
			? s.Substring(s.Length / 2, 1)
			: s.Substring(s.Length / 2 - 1, 2);
	}
}