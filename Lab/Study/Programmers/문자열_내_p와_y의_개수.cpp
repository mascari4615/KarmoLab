#include <string>
#include <vector>
#include <algorithm>
#include <iostream>
using namespace std;

bool solution(string s)
{
    int balance = 0;

	for (int i = 0; i < s.length(); i++)
	{
		if (s[i] == 'p' || s[i] == 'P')
			balance++;
		else if (s[i] == 'y' || s[i] == 'Y')
			balance--;
	}

    return balance == 0;
}