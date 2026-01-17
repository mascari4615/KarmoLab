using System;
using System.Text;

public class Solution
{
	public string solution(string number, int k)
	{
		StringBuilder sb = new StringBuilder();
		int startIndex = 0;
		for (int remainCharCount = number.Length - k; remainCharCount > 0; remainCharCount--)
		{
			// 시간초과로 인해 추가
			if (remainCharCount == number.Length - startIndex)
			{
				sb = new StringBuilder(sb.ToString() + number.Substring(startIndex, number.Length - startIndex));
				break;
			}

			char max = '0';
			int maxIndex = startIndex;
			for (int i = startIndex; i <= number.Length - remainCharCount; i++)
			{
				if (max < number[i])
				{
					max = number[i];
					maxIndex = i;

					// 시간초과로 인해 추가
					if (max == '9')
						break;
				}
			}
			sb.Append(max);
			startIndex = maxIndex + 1;
			// number = number.Substring(maxIndex + 1, number.Length - (maxIndex + 1));
		}
		return sb.ToString();
	}

	// 처음엔 number = number.Substring(maxIndex + 1, number.Length - (maxIndex + 1));
	// 이런식으로 필요한 문자열만 남겨서 계산했는데, 계속 새로운 문자열을 만드는거다보니 런타임을 엄청 먹었다
	// 그래서 startIndex 쓰는 식으로 변경 -> 시간이 엄청 줄었다..!

	// 다른 풀이보니 문자열 새로 만드는 대신, StringBuilder 로 문자 지우더라..
	// 더 공부해야겠다..
}