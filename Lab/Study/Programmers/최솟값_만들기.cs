using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public int solution(int[] A, int[] B)
	{
		Array.Sort(A);
		Array.Sort(B);

		for (int i = 0; i < A.Length; i++)
			A[i] = A[i] * B[i];

		return A.Sum();
	}

	/* 첫 풀이
	List<int> listA = A.ToList();
	List<int> listB = B.ToList();

	listA.Sort();
		listB.Sort();
		listB.Reverse();

		for (int i = 0; i<A.Length; i++)
			listA[i] = listA[i] * listB[i];

		return listA.Sum();
	*/

	// 굳이 리스트로 만들 필요 없이 Array.Sort 쓰고
	// 굳이 Reverse 할 필요없이 Length - 1 - index
}