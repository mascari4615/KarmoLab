using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public int solution(int[] citations)
	{
		for (int i = citations.Length; i >= 0; i--)
		{
			if (citations.Where(x => x >= i).Count() >= i)
				return i;
		}
		return 0;
	}

	// i 초기값을 Math.Min(citations.Length, citations.Max()) 할까 했는데
	// Max 값 찾는 연산이 생겨서 그런지, i 초기값 그냥 Length 인게 더 빠르네

	// 근데 정렬 문제였네
	// 처음에 정렬하고 뒤집어서 i 이상 개수 찾긴 했었는데
}