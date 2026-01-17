#include <string>
#include <vector>
#include <algorithm>

using namespace std;

bool compare(vector<int> v1, vector<int> v2)
{
	if (v1[1] == v2[1])
		return v1[0] < v2[0];

	return v1[1] < v2[1];
}

int solution(vector<vector<int>> jobs)
{
	sort(jobs.begin(), jobs.end(), compare);

	bool* completed = new bool[jobs.size()];
	for (int i = 0; i < jobs.size(); i++)
		completed[i] = false;

	int lastCompletedTime = 0;
	int sumOfElapsedTime = 0;

	for (int i = 0; i < jobs.size(); i++)
	{
		int curProcessIndex = -1;
		int earliestReqTime = 1001;
		int earliestReqIndex = -1;

		// 다음 작업을 찾는다.
		// 만약 당장 시작할 수 있는 작업이 없는 경우, 남은 작업 중 가장 먼저 요청된 작업을 찾는다.
		for (int ji = 0; ji < jobs.size(); ji++)
		{
			if (completed[ji])
				continue;

			if (jobs[ji][0] < earliestReqTime)
			{
				earliestReqTime = jobs[ji][0];
				earliestReqIndex = ji;
			}

			if (jobs[ji][0] > lastCompletedTime)
				continue;

			completed[ji] = true;

			curProcessIndex = ji;
			break;
		}

		if (curProcessIndex != -1)
		{
			sumOfElapsedTime += jobs[curProcessIndex][1] + (lastCompletedTime - jobs[curProcessIndex][0]);
			lastCompletedTime += jobs[curProcessIndex][1];
		}
		else
		{
			int breakTime = earliestReqTime - lastCompletedTime;
			completed[earliestReqIndex] = true;

			sumOfElapsedTime += jobs[earliestReqIndex][1] + earliestReqTime - jobs[earliestReqIndex][0];
			lastCompletedTime += jobs[earliestReqIndex][1] + breakTime;
		}
	}

	delete[] completed;
	return sumOfElapsedTime / jobs.size();
}