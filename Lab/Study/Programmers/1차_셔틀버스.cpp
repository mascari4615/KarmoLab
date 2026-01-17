#include <string>
#include <vector>
#include <algorithm>

using namespace std;

string solution(int n, int t, int m, vector<string> timetable)
{
	string answer = "";
	vector<int> v;

	for (int i = 0; i < timetable.size(); i++)
		v.push_back(stoi((timetable[i]).substr(0, 2)) * 60 + stoi((timetable[i]).substr(3, 2)));

	sort(v.begin(), v.end());

	int curIndex = 0;

	for (int i = 0; i < n; i++)
	{
		int minute = 540 + (t * i);
		int remainSeat = m;

		for (int j = 0; j < m; j++)
		{
			if (v[curIndex] > minute)
				break;

			curIndex++;
			remainSeat--;

			if (curIndex >= timetable.size())
				break;
		}

		if (i == n - 1)
		{
			if (remainSeat == 0)
				minute = v[curIndex - 1] - 1;

			if (minute / 60 < 10) answer += "0";
			answer += to_string(minute / 60) + ":";
			if (minute % 60 < 10) answer += "0";
			answer += to_string(minute % 60);
		}
	}

	return answer;
}