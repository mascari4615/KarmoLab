#include <string>
#include <vector>

using namespace std;

int solution(vector<string> vectorA, vector<string> vectorB)
{
    int answer = 0;
    for (int ai = 0; ai < vectorA.size(); ai++)
    {
        for (int bi = 0; bi < vectorB.size(); bi++)
        {
            if (vectorA[ai] == vectorB[bi])
            {
                answer++;
                break;
            }
        }
    }
    return answer;
}