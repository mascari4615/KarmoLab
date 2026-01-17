#include <string>
#include <vector>
#include <algorithm>

using namespace std;

int solution(int n)
{
    int answer = 0;
    for (int i = 0; i < n; i++)
    {
        answer++;
        
        while (answer % 3 == 0 ||
              (to_string(answer).find('3') != string::npos))
            answer++;
    }
    return answer;
}