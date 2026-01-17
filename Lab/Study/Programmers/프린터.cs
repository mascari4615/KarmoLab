using System;
using System.Collections.Generic;
using System.Collections;

public class Solution
{
	public int solution(int[] priorities, int location)
	{
		Queue<int> waitList = new Queue<int>();
		List<int> printList = new List<int>();

		for (int i = 0; i < priorities.Length; i++)
			waitList.Enqueue(i);

		while (waitList.Count > 0)
		{
			int curDoc = waitList.Dequeue();
			bool canPrint = true;

			for (int i = 0; i < priorities.Length; i++)
			{
				if (printList.Contains(i))
					continue;

				if (priorities[curDoc] < priorities[i])
				{
					canPrint = false;
					waitList.Enqueue(curDoc);
					break;
				}
			}

			if (canPrint)
				printList.Add(curDoc);
		}

		return printList.IndexOf(location) + 1;
	}
}