#include <string>
#include <vector>
#include <algorithm>

using namespace std;

string solution(string s)
{
    for (auto& c : s)
    {
        c = tolower(c);
    }
    
    sort(s.begin(), s.end());
    
    return s;
}