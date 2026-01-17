using System;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
	public bool solution(string s)
	{
		// if (s.Length is not (4 or 6)) return false;
        // 패턴일치, 프로그래머스 컴파일 버전에서는 지원안함

        if (!((s.Length == 4) || (s.Length == 6))) return false;
		foreach (char c in s)
			if (c > 57)
				return false;
		return true;
	}
}