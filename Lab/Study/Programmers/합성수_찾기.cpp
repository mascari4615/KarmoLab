#include <string>
#include <vector>
#include <algorithm>
#include <cmath>

using namespace std;

bool isCompositeNum(int num)
{
    int divisorCount = 0;
    
    for (int i = 1; i <= (int)sqrt(num); i++)
    {
        if (num % i == 0)
        {
            if (num / i != i)
                divisorCount++;
            divisorCount++;
            
            if (divisorCount >= 3)
                return true;
        }
    }
    
    return false;
}

int solution(int n)
{
    int answer = 0;
    for (int i = 1; i <= n; i++)
    {
        if (isCompositeNum(i))
            answer++;
    }
    return answer;
}
