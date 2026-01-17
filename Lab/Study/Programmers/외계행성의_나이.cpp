#include <string>
#include <vector>

using namespace std;

string solution(int age)
{
    string answer = "";
    for (; age != 0; age /= 10)
    {
        answer = (char)('a' + (age % 10)) + answer;
    }
    return answer;
}