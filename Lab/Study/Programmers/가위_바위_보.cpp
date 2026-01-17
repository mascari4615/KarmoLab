#include <string>
#include <vector>

using namespace std;

string solution(string rsp)
{
    string answer = "";
    for (auto c : rsp)
    {
        if (c == '2')
            answer += '0';
        else if (c == '0')
            answer += '5';
        else
            answer += '2';
    }
    return answer;
}