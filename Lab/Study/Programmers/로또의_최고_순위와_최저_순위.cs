using System;

public class Solution
{

	public int[] solution(int[] lottos, int[] win_nums)
	{
		int[] answer = new int[2];
		int correctStack = 0;
		int zeroCount = 0;

		foreach (var lotto in lottos)
		{
			if (lotto == 0)
				zeroCount++;
			else
			{
				foreach (var win_num in win_nums)
				{
					if (win_num == lotto)
					{
						correctStack++;
						break;
					}
				}		
			}
		}

		answer[0] = Math.Clamp(6 - (correctStack + zeroCount) + 1, 1, 6);
		answer[1] = Math.Clamp(6 - correctStack + 1, 1, 6);

		return answer;
	}
}