using System;
using System.Collections.Generic;

public class Solution
{
	public int[] solution(int[] progresses, int[] speeds)
	{
		List<int> result = new List<int>();
		int lastIndex = 0;
		while (lastIndex != progresses.Length)
		{
			for (int i = 0; i < progresses.Length; i++)
			{
				if (progresses[i] < 100)
					progresses[i] += speeds[i];
			}

			int completeCount = 0;
			for (int i = lastIndex; i < progresses.Length; i++)
			{
				if (progresses[i] < 100)
					break;

				completeCount++;
				lastIndex = i + 1;
			}

			if (completeCount != 0)
				result.Add(completeCount);
		}
		return result.ToArray();
	}
}