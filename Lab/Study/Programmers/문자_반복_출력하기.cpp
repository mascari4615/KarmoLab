#include <string>
#include <vector>

using namespace std;

string solution(string my_string, int n)
{
    string answer = "";
    for (int si = 0; si < my_string.size(); si++)
    {
        for (int ci = 0; ci < n; ci++)
        {
            answer += my_string[si];
        }
    }
    return answer;
}