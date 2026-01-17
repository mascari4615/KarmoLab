#include <string>
#include <vector>
#include <algorithm>
#include <iostream>
#include <cmath>

using namespace std;

int solution(string dartResult) 
{
    int answer = 0;
	int prevResult = 0;
	int curResult = 0;
	for (int i = 0; i < dartResult.length(); i++)
	{
		cout << i << "번째" << endl;

		if (48 <= dartResult[i] && dartResult[i] <= 57)
		{
			cout << "NUM" << endl;

			answer += prevResult;
			prevResult = curResult;
			curResult = dartResult[i] - 48;

			if (dartResult[i + 1] == 48)
			{
				curResult = 10;
				i++;
			}
		}
		// Skip 'S'
		else if (dartResult[i] == 'D' || dartResult[i] == 'T')
		{
			cout << "DT" << endl;
			curResult = pow(curResult, dartResult[i] == 'D' ? 2 : 3);
		}
		else if (dartResult[i] == '*')
		{
			cout << "*" << endl;

			prevResult *= 2;
			curResult *= 2;
		}
		else if (dartResult[i] == '#')
		{
			cout << "#" << endl;

			curResult *= -1;
		}

		// 2 8 27
		cout << "Answer : " << answer << endl;
		cout << "prevResult : " << prevResult << endl;
		cout << "curResult : " << curResult << endl;
	}

	answer += prevResult;
	cout << answer << endl;

	answer += curResult;
	cout << answer << endl;

	return answer;
}