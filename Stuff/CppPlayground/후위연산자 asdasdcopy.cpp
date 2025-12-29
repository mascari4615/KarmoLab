#include <iostream>
#include <algorithm>
#include <math.h>
#include <vector>
#include <stack>

typedef long long ll;

using namespace std;

int compareIt(char a, char b)
{
	int aScore = getScore(a);
	int bScore = getScore(b);

	if (aScore < bScore)
	{
		return -1;
	}
	else if (aScore > bScore)
	{
		return 1;
	}
	else
	{
		return 0;
	}
}

int getScore(char c)
{
	return isStrong(c) ? 2 : isNormal(c) ? 1
										 : 0;
}

bool isStrong(char c)
{
	return c == '(' || c == ')';
}

bool isNormal(char c)
{
	return c == '*' || c == '/';
}

bool isWeak(char c)
{
	return c == '-' || c == '+';
}

bool isABC(char c)
{
	return (isStrong(c) || isNormal(c) || isWeak(c)) == false;
}

int main()
{
	ios_base::sync_with_stdio(false);
	cin.tie(NULL);
	cout.tie(NULL);

	string s;
	cin >> s;

	stack<char> stk;

	for (char c : s)
	{
		if (isABC(c))
			cout << c;
		else
		{
			if (stk.empty())
			{
				stk.push(c);
			}
			else
			{
				if (isStrong(c))
				{
					if (c == '(')
					{
						stk.push(c);
					}
					else
					{
						char tmp = '#';
						while (stk.empty() == false && tmp != ')')
						{
							tmp = stk.top();
							stk.pop();
							cout << tmp;
						}
					}
				}
				else
				{
					char tmp = stk.top();
					while (stk.empty() == false && compareIt(c, tmp))
					{
						tmp = stk.top();
						stk.pop();
						cout << tmp;
					}
				}
			}
		}
	}

	while (stk.empty() == false)
	{
		cout << stk.top();
		stk.pop();
	}
}