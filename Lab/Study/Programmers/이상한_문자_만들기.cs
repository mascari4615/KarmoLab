using System;
using System.Text;

public class Solution
{
	public string solution(string s)
	{
		StringBuilder sb = new StringBuilder(s);
		int wordStartIndex = 0;
		for (int i = 0; i < s.Length; i++)
		{
			if (s[i] == ' ')
				wordStartIndex = i + 1;
			else
				sb[i] = (i - wordStartIndex) % 2 == 0 ? char.ToUpper(sb[i]) : char.ToLower(sb[i]);

			/*
			 * 짝수 대문자, 홀수 소문자
			 * 65 대문자, 97 소문자
			 * 
			 * ToUpper ToLower 존재를 몰라서 아래로 풀었었다
			 * 
			 * sb[i] = (char)(sb[i] + ((i - wordStartIndex) % 2 == 0
			 * ? sb[i] >= 97 ? -32 : 0 
			 * : sb[i] >= 97 ? 0 : 32));
			 */
		}
		return sb.ToString();
	}
}