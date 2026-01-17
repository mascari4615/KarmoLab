#include <string>
#include <vector>
#include <algorithm>

using namespace std;

int startIndex;

bool compare(string a, string b)
{
    if (a[startIndex] == b[startIndex])
    {
        for (int i = 0; i < a.length(); i++)
        {
            if (a[i] != b[i])
            {
                return a[i] < b[i];
            }
        }
    }
    else
    {
        return a[startIndex] < b[startIndex];
    }
}

vector<string> solution(vector<string> strings, int n) 
{
    startIndex = n;
    sort(strings.begin(), strings.end(), compare);
    return strings;
}