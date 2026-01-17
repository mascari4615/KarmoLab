#include <string>
#include <vector>

using namespace std;

int solution(string my_string)
{
    int answer = 0;
    string s = "";
    
    for (auto c : my_string)
    {
        if (isdigit(c))
            s += c;
        else if (s != "")
        {
            answer += stoi(s);
            s = "";
        }
    }
    
    if (s != "")
        answer += stoi(s);
    
    return answer;
}

// stringstream