#include <vector>
#include <iostream>

using namespace std;

vector<int> solution(vector<int> arr)
{
    vector<int> answer;
	int lastInt = -1;

	for (int i = 0; i < arr.size(); i++)
	{
		if (lastInt != arr[i])
		{
			answer.push_back(arr[i]);
			lastInt = arr[i];
		}
	}

    return answer;
}