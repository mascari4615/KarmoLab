using System;

class Program1712
{
	static void Main()
	{
		int n = int.Parse(Console.ReadLine());
		int i = 1;
		while (true)
		{
			if (1 + 6 * (i - 1) < n && 1 + 6 * (i) > n)

			i++;
		}
		Console.WriteLine();
	}
}