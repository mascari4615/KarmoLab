#include <string>
#include <vector>
#include <algorithm>

using namespace std;

int arr[256];

int solution(string before, string after)
{
    for (auto c : before)
    {
        arr[(int)c]++;
    }
    
    for (auto c : after)
    {
        arr[(int)c]--;
        
        if (arr[(int)c] < 0)
            return 0;
    }
    
    return 1;
    
    // 다른 풀이보니 sort로 쉽게 풀 수 있었다
}