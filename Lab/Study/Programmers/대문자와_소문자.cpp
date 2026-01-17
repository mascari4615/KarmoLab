#include <string>
#include <vector>

using namespace std;

string solution(string my_string)
{
    string answer = "";
    int distance = 'a' - 'A';
    
    for (auto c : my_string)
    {
        if (c <= 'Z')
            answer += c + distance;
        else
            answer += c - distance;
    }
    return answer;
}