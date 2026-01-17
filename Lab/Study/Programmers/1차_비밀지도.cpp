#include <string>
#include <vector>
#include <algorithm>
#include <numeric>
#include <iostream>
#include <bitset>

using namespace std;

vector<string> solution(int n, vector<int> arr1, vector<int> arr2)
{
	vector<string> answer;


	for (int i = 0; i < n; i++)
	{
		bitset<16> temp0 = bitset<16>(arr1[i]);
		bitset<16> temp1 = bitset<16>(arr2[i]);

		string result = "";
		for (int j = n - 1; j >= 0; j--)
		{
			result.append(((temp0[j] | temp1[j]) == 0) ? " " : "#");
		}
		answer.push_back(result);
	}

	return answer;
}