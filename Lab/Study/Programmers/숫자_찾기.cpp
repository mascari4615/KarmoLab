#include <string>
#include <vector>
#include <algorithm>

using namespace std;

int solution(int num, int k)
{
    vector<int> nums;
    for (; num != 0; num /= 10)
        nums.push_back(num % 10);
    
    reverse(nums.begin(), nums.end());
    
    for(int i = 0; i < nums.size(); i++)
    {
        if (nums[i] == k)
            return i + 1;
    }
    
    return -1;
}