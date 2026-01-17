using System;

class Program1316
{
	static void Main()
	{
		int n = int.Parse(Console.ReadLine());
		int count = 0;

		for (int i = 0; i < n; i++)
		{
			if (IsGroupWord(Console.ReadLine()))
				count++;
		}

		Console.WriteLine(count);
	}

	static bool IsGroupWord(string s)
	{
		bool[] alphabetCheck = new bool[26];
		char pre = s[0];
		alphabetCheck[pre - 'a'] = true;

		for (int j = 1; j < s.Length; j++)
		{
			if (alphabetCheck[s[j] - 'a'] == false)
				alphabetCheck[s[j] - 'a'] = true;
			else
			{
				if (pre != s[j])
				{
					return false;
				}
			}

			pre = s[j];
		}
		return true;
	}
}