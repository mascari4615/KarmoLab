using System;

class Program24901
{
	static void Main()
	{
		int n = int.Parse(Console.ReadLine());

		for (int i = 0; i <= n; i++)
		{
			string s = Convert.ToString(i, 2);
			Console.Write(s);
			/*for (int j = 0; j < s.Length; j++)
			{
				Console.Write(s[j]);
			}*/
		}
	}
}