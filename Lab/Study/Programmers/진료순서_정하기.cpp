#include <string>
#include <vector>
#include <algorithm>
#include <map>

using namespace std;

vector<int> solution(vector<int> emergency)
{
    map<int, int> m;   
    vector<int> v(emergency);
    
    sort(v.begin(), v.end());
    reverse(v.begin(), v.end());
    
    for (int i = 0; i < v.size(); i++)
    {
        m[v[i]] = i + 1;
    }
    
    vector<int> answer;
    for (int i = 0; i < emergency.size(); i++)
    {
        answer.push_back(m[emergency[i]]);
    }
    
    return answer;
}