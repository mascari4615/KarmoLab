using System;

public class Solution
{
	public int solution(string s)
	{
		int answer = 0;
		int i = 0;

		while (i < s.Length)
		{
			if (s[i] < 65) // 숫자
			{
				answer = (answer * 10) + int.Parse(s[i].ToString());
				i++;
			}
			else // 문자
			{
				int data = GetWordData(s.Substring(i, 2));
				int data0 = data / 10;
				int data1 = data % 10;
				answer = (answer * 10) + data1;
				i += data0;
			}
		}

		return answer;
	}

	private int GetWordData(string word)
	{
		switch (word)
		{
			case "ze":
				return 40;
			case "on":
				return 31;
			case "tw":
				return 32;
			case "th":
				return 53;
			case "fo":
				return 44;
			case "fi":
				return 45;
			case "si":
				return 36;
			case "se":
				return 57;
			case "ei":
				return 58;
			case "ni":
				return 49;
			default:
				Console.WriteLine("Invalid Word");
				return int.MinValue;
		}
	}
}