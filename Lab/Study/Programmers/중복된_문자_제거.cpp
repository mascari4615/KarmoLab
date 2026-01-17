#include <string>
#include <vector>
#include <algorithm>

using namespace std;

bool used[256];

string solution(string s)
{
    // sort(s.begin(), s.end());
    // s.erase(unique(s.begin(), s.end()), s.end());
    
    string answer = "";
    for (auto c : s)
    {
        if (used[c])
            continue;
        
        used[c] = true;
        answer += c;
    }
    
    return answer;
}