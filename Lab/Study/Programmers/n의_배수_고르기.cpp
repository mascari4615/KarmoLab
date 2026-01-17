#include <string>
#include <vector>

using namespace std;

vector<int> solution(int n, vector<int> v)
{
    vector<int> answer;
    for (auto i : v)
    {
        if (i % n == 0)
            answer.push_back(i);
    }
    return answer;
}