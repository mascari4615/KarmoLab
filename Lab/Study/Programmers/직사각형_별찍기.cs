using System;
using System.Collections.Generic;
using System.Linq;

public class Example
{
	public static void Main()
	{
		string[] s = Console.ReadLine().Split(' ');
		Console.WriteLine(string.Concat(Enumerable.Repeat(string.Concat(Enumerable.Repeat('*', int.Parse(s[0]))) + '\n', int.Parse(s[1]))).TrimEnd());
	}
}