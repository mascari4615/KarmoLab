#include <string>
#include <vector>

using namespace std;

int solution(int n)
{
    int answer = 1;
    
    for (int i = n - 1; i > 0; i--)
    {
        int sum = 0;
        
        for (int j = i; j > 0; j--)
        {
            sum += j;
            
            if (sum >= n)
                break;
        }
        
        if (sum == n)
            answer++;
        
        if (sum < n)
            break;
    }
    
    return answer;
}