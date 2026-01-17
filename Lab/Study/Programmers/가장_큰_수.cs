using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;

public class Solution
{
	public string solution(int[] numbers)
	{
		List<string> s = numbers.Select(o => o.ToString()).ToList();
		s.Sort(MyCompare);

		// Too Slow
		// return s.Aggregate((text, next) => text + next);

		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < s.Count; i++)
			sb.Append(s[i]);

		string answer = sb.ToString();

		// [0, 0, 0] = "0", != "000"
		if (answer.StartsWith('0'))
			answer = "0";

		return answer;
	}


	private int MyCompare(string s1, string s2)
	{
		// string s1First = s1 + s2;
		// string s2First = s2 + s1;

		// Int Compare is more fast
		int s1First = int.Parse(s1 + s2);
		int s2First = int.Parse(s2 + s1);

		return s2First.CompareTo(s1First);
	}
}