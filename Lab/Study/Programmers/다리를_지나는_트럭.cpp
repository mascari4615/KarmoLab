#include <string>
#include <vector>
#include <queue>

using namespace std;

// 문제
// return min(모든 트럭이 다리를 건너는 시간)

// 조건
// 1 <= bridgeLength, maxWeight, truckWeights <= 10,000
// 1 <= truckWeights[n] <= maxWeight

// 최소 시간이라 정렬하고 있었는데, 문제 다시 보니 정해진 순서였다..
// 허무..

int solution(int bridgeLength, int maxWeight, vector<int> truckWeights)
{
	int duration = 0;
	int passedTruckCount = 0;
	int totalTruckCount = truckWeights.size();
	queue<int> q;
	int qSum = 0;

	for (int i = 0; i < bridgeLength; i++)
		q.push(0);

	while (true)
	{
		duration++;

		int passed = q.front();
		qSum -= passed;
		q.pop();

		if (passed != 0)
			passedTruckCount++;

		if (passedTruckCount == totalTruckCount)
			break;

		if ((truckWeights.size() > 0) &&
			(qSum + truckWeights.back() <= maxWeight))
		{
			q.push(truckWeights.back());
			qSum += q.back();
			truckWeights.pop_back();
		}
		else
		{
			q.push(0);
		}
	}

	return duration;
}