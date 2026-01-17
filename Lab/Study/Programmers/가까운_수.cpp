#include <string>
#include <vector>
#include <cmath>

using namespace std;

int solution(vector<int> array, int n)
{
    int answer = 0;
    int diff = 4444;
    
    for (int e : array)
    {
        if (abs(n - e) == abs(diff))
        {
            if ((n - e) > 0)
            {
                answer = e;
                diff = n - e;
            }
        }
        else if (abs(n - e) < abs(diff))
        {
            answer = e;
            diff = n - e;
        }
    }
    
    return answer;
}