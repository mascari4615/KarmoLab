#include <iostream>
#include <string>
#include <vector>
#include <queue>

using namespace std;

// 문제
// return 모든 숫자 K 이상, 섞어야 하는 최소 횟수
// 불가능 하면 -1

// 조건
// 가장 낮은 + 두 번째로 낮은 * 2

using namespace std;

int solution(vector<int> scoville, int K)
{
	int mixCount = 0;
	bool containsKHigh = false;
	priority_queue<int, vector<int>, greater<int>> q;

	for (int i = 0; i < scoville.size(); i++)
	{
		if (scoville[i] < K)
			q.push(scoville[i]);
		else
			containsKHigh = true;
	}

	while (q.size() > 1)
	{
		int mix = q.top();
		q.pop();
		mix += q.top() * 2;
		q.pop();

		mixCount++;

		if (mix >= K)
			containsKHigh = true;
		else
			q.push(mix);
	}

	if (q.size() == 1)
	{
		if (containsKHigh)
			mixCount++;
		else
			return -1;
	}

	return mixCount;
}

// 처음에 Vector로 풀었다가 시간 초과

/*
int solution(vector<int> scoville, int K)
{
	int mixCount = 0;

	while (true)
	{
		sort(scoville.begin(), scoville.end());

		if (scoville[0] < K)
		{
			if (scoville.size() <= 1)
				return -1;

			scoville.push_back(scoville[0] + scoville[1] * 2);
			scoville.erase(scoville.begin() + 1);
			scoville.erase(scoville.begin() + 0);
			mixCount++;
		}
		else
		{
			break;
		}
	}

	return mixCount;
}
*/