#include <iostream>
#include <string>
#include <stack>

using namespace std;

int solution(string s)
{
    if (s.size() % 2 != 0)
        return false;
    
    stack<char> myStack;
    for (auto c : s)
    {
        if (!myStack.empty() && myStack.top() == c)
            myStack.pop();
        else
            myStack.push(c);
    }

    return myStack.empty();
}

// 첫 번째 시도 : 55.2, 0.0, 55.2

// #include <iostream>
// #include <string>
// #include <stack>

// using namespace std;

// int solution(string s)
// {
//     stack<char> myStack;
//     for (auto c : s)
//     {
//         if (myStack.top() == c)
//             myStack.pop();
//         else
//             myStack.push(c);
//     }

//     return myStack.empty();
// }