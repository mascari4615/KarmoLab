using System;
using System.Text;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public string solution(string s)
	{
		StringBuilder sb = new StringBuilder(s.ToLower());
		int wordStartIndex = 0;
		for (int i = 0; i < s.Length; i++)
		{
			if (sb[i] == ' ')
				wordStartIndex = i + 1;
			else if (wordStartIndex == i)
				sb[i] = sb[i].ToString().ToUpper()[0];
		}
		return sb.ToString();
	}

	// ToUpper ToLower는 다행히 알파벳 문자 이외의 문자가 포함된 문자열도 변환해준다

	// https://stackoverflow.com/questions/6297922/why-doesnt-toupper-return-when-applied-to-8
	// 이건 질문과 답변이 재밌어서 메모
}