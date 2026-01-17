#include <string>
#include <vector>
#include <algorithm>

using namespace std;

vector<int> solution(string s)
{
    vector<int> answer;
    for (auto c : s)
    {
        if (c <= '9')
            answer.push_back((int)(c - '0'));
    }
    sort(answer.begin(), answer.end());
    return answer;
}