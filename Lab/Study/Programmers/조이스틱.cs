using System;

public class Solution
{

	public int solution(string name)
	{
		int[] nameToInt = new int[name.Length];
		for (int i = 0; i < name.Length; i++)
			nameToInt[i] = name[i] - 65;

		// 0 A
		// 25 Z
		int answer = 0;
		int curIndex = 0;
		int completeCount = 0;
		bool[] complete = new bool[name.Length];

		for (int i = 1; i < name.Length; i++)
		{
			if (nameToInt[i] == 0)
			{
				complete[i] = true;
				completeCount++;
			}
		}

		while (completeCount < name.Length)
		{
			Console.WriteLine("ÀÌµ¿ : " + (nameToInt[curIndex] > 12 ? 26 - nameToInt[curIndex] : nameToInt[curIndex]));
			answer += nameToInt[curIndex] > 12 ? 26 - nameToInt[curIndex] : nameToInt[curIndex];
			complete[curIndex] = true;
			if (++completeCount == name.Length)
				break;

			int nextIndex = curIndex;
			int nextDistance = 0;
			int nextA_Distance = 0;
			while (true)
			{
				nextDistance++;
				nextIndex++;
				if (nextIndex >= name.Length)
					nextIndex = 0;

				if (complete[nextIndex] == false)
				{
					int nextA_Index = nextIndex;
					while (true)
					{
						nextA_Distance++;
						nextA_Index++;
						if (nextA_Index >= name.Length)
							nextA_Index = 0;

						if (complete[nextA_Index])
							break;
					}
					break;
				}
			}

			int priviousIndex = curIndex;
			int priviousDistance = 0;
			int priviousA_Distance = 0;
			while (true)
			{
				priviousDistance++;
				priviousIndex--;
				if (priviousIndex < 0)
					priviousIndex = name.Length - 1;

				if (complete[priviousIndex] == false)
				{
					int priviousA_Index = priviousIndex;
					while (true)
					{
						priviousA_Distance++;
						priviousA_Index--;
						if (priviousA_Index < 0)
							priviousA_Index = name.Length - 1;

						if (complete[priviousA_Index])
							break;
					}
					break;
				}
			}

			if (priviousDistance == nextDistance)
			{
				answer += nextA_Distance < priviousA_Distance ? nextDistance : priviousDistance;
				curIndex = nextA_Distance < priviousA_Distance ? nextIndex : priviousIndex;
			}
			else
			{
				answer += nextDistance < priviousDistance ? nextDistance : priviousDistance;
				curIndex = nextDistance < priviousDistance ? nextIndex : priviousIndex;
			}
		}
		return answer;
	}
}