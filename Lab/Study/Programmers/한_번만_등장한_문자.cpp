#include <string>
#include <vector>

using namespace std;

string solution(string s)
{
    int a[26] = { 0, };
    // memset(a, 0, 26);
    
    string answer = "";
    
    for (auto c : s)
    {
        a[(int)(c - 'a')]++;
    }
    
    for (int i = 0; i < 26; i++)
    {
        if (a[i] == 1)
            answer += (char)(i + 'a');
    }
    return answer;
}