#include <vector>
#include <algorithm>
using namespace std;

int solution(vector<int> nums)
{
	int count = 0, maxCount = nums.size() / 2, lastPokemon = 0;

	sort(nums.begin(), nums.end());

	for (int i = 0; i < nums.size(); i++)
	{
		if (nums[i] != lastPokemon)
		{
			lastPokemon = nums[i];
			count++;

			if (maxCount == count)
				break;
		}
	}

	return count;
}