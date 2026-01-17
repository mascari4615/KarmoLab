using System;

public class Solution
{
	public int[] solution(int[] array, int[,] commands)
	{
		int[] answer = new int[commands.GetLength(0)]; ;
		for (int i = 0; i < commands.GetLength(0); i++)
		{
			int arrLength = commands[i, 1] - commands[i, 0] + 1;
			int[] newArr = new int[arrLength];
			Array.Copy(array, commands[i, 0] - 1, newArr, 0, arrLength);

			for (int j = 0; j < newArr.Length - 1; j++)
			{
				for (int k = j + 1; k < newArr.Length; k++)
				{
					if (newArr[j] > newArr[k])
					{
						int temp = newArr[k];
						newArr[k] = newArr[j];
						newArr[j] = temp;
					}
				}
			}
			
			answer[i] = newArr[commands[i, 2] - 1];
		}
		return answer;
	}
}