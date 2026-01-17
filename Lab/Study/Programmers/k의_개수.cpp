#include <string>
#include <vector>

using namespace std;

int solution(int i, int j, int k)
{
    int answer = 0;
    for (; i <= j; i++)
    {
        for (int r = i; r != 0; r /= 10)
        {
            if (r % 10 == k)
                answer++;
        }
    }
    return answer;
}