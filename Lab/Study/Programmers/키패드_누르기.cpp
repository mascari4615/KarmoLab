#include <string>
#include <vector>
#include <iostream>
#include <algorithm>
#include <cstdlib>
using namespace std;

int GetDistance(int origin, int target)
{
	int distance = 0;
	distance = abs(((origin - 1) / 3) - ((target - 1) / 3)) + abs(((origin - 1) % 3) - ((target - 1) % 3));
	cout << distance << endl;
	return distance;
}

string solution(vector<int> numbers, string hand)
{
	string answer = "";
	int leftPos = 10;
	int rightPos = 12;
	bool isRightHanded = (hand == "right");

	for (auto num : numbers)
	{
		int targetNum = (num == 0) ? 11 : num;

		switch (targetNum)
		{
			case 1:
			case 4:
			case 7:
				answer += "L";
				leftPos = targetNum;
				break;
			case 3:
			case 6:
			case 9:
				answer += "R";
				rightPos = targetNum;
				break;
			case 2:
			case 5:
			case 8:
			case 11:
			{
				int leftDistance = GetDistance(leftPos, targetNum);
				int rightDistance = GetDistance(rightPos, targetNum);

				if (leftDistance == rightDistance)
				{
					answer += isRightHanded ? "R" : "L";

					if (isRightHanded)
						rightPos = targetNum;
					else
						leftPos = targetNum;
				}
				else
				{
					answer += (rightDistance < leftDistance) ? "R" : "L";

					if (rightDistance < leftDistance)
						rightPos = targetNum;
					else
						leftPos = targetNum;
				}

				break;
			}
			default:
				break;
		}
	}

	return answer;
}