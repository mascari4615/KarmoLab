using System;

public class Solution
{
	public long solution(long n)
	{
		// 첫 풀이, 왜 이렇게 복잡하게 생각했지
		// return Math.Pow((long)Math.Round(Math.Sqrt(n)), 2) == n ? (long)Math.Pow(Math.Sqrt(n) + 1, 2) : -1;
		return Math.Sqrt(n) % 1.0 == 0 ? (long)Math.Pow(Math.Sqrt(n) + 1, 2) : -1;
	}
}