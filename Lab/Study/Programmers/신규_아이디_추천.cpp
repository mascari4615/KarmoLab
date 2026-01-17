#include <string>
#include <vector>
#include <iostream>
#include <algorithm>

using namespace std;

string solution(string new_id);

string solution(string new_id)
{
    string answer = "";
    char lastChar = 0;

    for (int i = 0; i < (int)new_id.length(); i++)
    {
        char a = new_id[i];

        if ('A' <= a && a <= 'Z')
        {
            lastChar = a + 32;
            answer += lastChar;
        }
        else if (('0' <= a && a <= '9') || ('a' <= a && a <= 'z') || a == '-' || a == '_')
        {
            answer += (lastChar = a);
        }
        else if (a == '.')
        {
            if ((lastChar == 0) || (i == (int)new_id.length() - 1) || (lastChar == '.'))
            {
                continue;
            }
            else
            {
                answer += (lastChar = a);
            }
        }
    }
    
    while (answer[answer.length() - 1] == '.')
    {
        answer = answer.substr(0, answer.length() - 1);
    }

    if (answer == "")
    {
        answer = "a";
    } 

    if (answer.length() < 3)
    {
        while (answer.length() < 3)
        {
            answer += answer[answer.length() - 1];
        }
    }

    if (answer.length() > 15)
    {
        answer = answer.substr(0, 15);  
        while (answer[answer.length() - 1] == '.')
        {
            answer = answer.substr(0, answer.length() - 1);
        }
    }

    return answer;
}