#include <string>
#include <vector>

using namespace std;

string solution(string myString)
{
    string newS = "";
    
    for (auto c : myString)
    {
        newS += tolower(c);
    }
    
    return newS;
}