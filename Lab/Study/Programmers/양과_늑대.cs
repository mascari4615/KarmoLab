using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public int solution(int[] nodeInfo, int[,] edges)
	{
		List<int> visitableNodes = new List<int>();
		for (int i = 0; i < edges.GetLength(0); i++)
		{
			if (edges[i, 0] == 0)
				visitableNodes.Add(edges[i, 1]);
		}
		return Recursive(0, 0, 0, 0, visitableNodes, nodeInfo, edges);
	}

	public int Recursive(int curNode, int maxSheepCount, int sheepCount, int wolfCount, List<int> visitableNodes, int[] nodeInfo, int[,] edges)
	{
		if (nodeInfo[curNode] == 0)
			sheepCount++;
		else
			wolfCount++;
        
        if (sheepCount <= wolfCount)
            return maxSheepCount;

		maxSheepCount = Math.Max(maxSheepCount, sheepCount);

		for (int i = 0; i < visitableNodes.Count; i++)
		{
			List<int> newVisitableNodes = visitableNodes.ToList();
			newVisitableNodes.Remove(visitableNodes[i]);

			for (int j = 0; j < edges.GetLength(0); j++)
			{
				if (edges[j, 0] == visitableNodes[i])
					newVisitableNodes.Add(edges[j, 1]);
			}

			maxSheepCount = Math.Max(maxSheepCount, Recursive(visitableNodes[i], maxSheepCount, sheepCount, wolfCount, newVisitableNodes, nodeInfo, edges));
		}

		return maxSheepCount;
	}
}