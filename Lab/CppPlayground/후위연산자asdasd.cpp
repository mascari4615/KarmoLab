#include <iostream>
#include <algorithm>
#include <math.h>
#include <vector>

typedef long long ll;

using namespace std;

string s;

bool isStrong(char c)
{
	return c == '*' || c == '/';
}

bool isWeak(char c)
{
	return c == '-' || c == '+';
}

int getNextCalc(int preClacIndex)
{
	// 괄호 확인을 먼저 하기 때문에, 괄호가 나오는 경우는 없음
	for (int i = preClacIndex + 1; i < s.size(); i++)
	{
		if (isWeak(s[i]) || isStrong(s[i]))
			return i;
	}

	// cout << "WHAT";
	return -1;
}

int getNextClose(int openIndex)
{
	int openCount = 0;
	for (int i = openIndex + 1; i < s.size(); i++)
	{
		if (s[i] == '(')
			openCount++;

		if (s[i] == ')')
		{
			if (openCount > 0)
				openCount--;
			else
				return i;
		}
	}

	// cout << "WHAT";
	return -1;
}

void someFunc(int start, int end)
{
	int curPointer = start;
	char curCalc = ' ';

	// if (stk.empty())
	{
		// 왼쪽 숫자를 넣을 차례

		if (s[start] == '(')
		{
			// 괄호가 열려 있다면

			int close = getNextClose(start);
			someFunc(start + 1, close - 1);

			curPointer = close + 1;
		}
		else
		{
			cout << s[start];

			curPointer++;
		}
	}
	// else
	{
		// 기호를 보관하고
		curCalc = s[curPointer];
		curPointer++;

		// 오른쪽 숫자를 넣을 차례
		if (s[curPointer] == '(')
		{
			// 괄호가 열려 있다면

			int close = getNextClose(curPointer);
			someFunc(curPointer + 1, close - 1);

			curPointer = close + 1;
		}
		else
		{
			// 바로 숫자인데

			if (isStrong(curCalc))
			{
				// 지금 기호가 강한 기호면

				cout << s[curPointer];
				curPointer++;
			}
			else
			{
				// 지금 기호가 약한 기호고

				int nextCalcIndex = getNextCalc(curPointer - 1);
				if (nextCalcIndex == -1)
				{
					// 다음 기호가 없으면 (지금 기호가 마지막 기호면)

					cout << s[curPointer];
					curPointer++;
				}
				else
				{
					// 다음 기호가 있고

					char nextCalc = s[nextCalcIndex];
					if (isWeak(nextCalc))
					{
						// 그 기호가 약하면

						cout << s[curPointer];
						curPointer++;

						// someFunc(nextCalcIndex - 1, nextCalcIndex + 1);
						// curPointer += 3;
					}
					else
					{
						// 다음 기호가 강하면

						int lastChainCalcIndex = nextCalcIndex;
						int chainCount = 1;

						while (true)
						{
							int temp = getNextCalc(lastChainCalcIndex);
							if (isStrong(s[temp]))
							{
								chainCount++;
								lastChainCalcIndex = temp;
							}
							else
							{
								break;
							}
						}

						// cout << chainCount;

						if (chainCount == 1)
						{
							// 체인이 1개라면
							someFunc(lastChainCalcIndex - 1, lastChainCalcIndex + 1);
							curPointer += 3;
						}
						else
						{
							// 체인이 여러 개라면
							someFunc(curPointer, lastChainCalcIndex + 1);
							curPointer = lastChainCalcIndex + 2;
						}
					}
				}
			}
		}
	}

	cout << curCalc;

	while (end == s.size() && curPointer < s.size())
	{
		cout << "OUT";

		curCalc = s[curPointer];
		curPointer++;

		int nextCalcIndex = getNextCalc(curPointer - 1);
		if (nextCalcIndex == -1)
		{
			// End Line
			cout << s[curPointer];
			curPointer++;
		}
		else
		{
			if (s[curPointer] == '(')
			{
				// 괄호가 열려 있다면

				int close = getNextClose(curPointer);
				someFunc(curPointer + 1, close - 1);

				curPointer = close + 1;
			}
			else
			{
				bool isCucCalcWeak = curCalc == '-' || curCalc == '+';
				if (isCucCalcWeak == false)
				{
					someFunc(curPointer, s.size());
					cout << s[curPointer];
				}
				else
				{
					if (nextCalcIndex == -1)
					{
						someFunc(curPointer, s.size());
						cout << s[curPointer];
					}
					else
					{
						char nextCalc = s[nextCalcIndex];
						bool isNextCalcStrong = nextCalc == '*' || nextCalc == '/';

						if (isNextCalcStrong)
						{
							someFunc(nextCalcIndex - 1, nextCalcIndex + 1);
							curPointer += 3;
						}
						else
						{
							cout << s[curPointer];
							curPointer++;
						}
					}
				}
			}
		}

		cout << curCalc;
	}
}

int main()
{
	ios_base::sync_with_stdio(false);
	cin.tie(NULL);
	cout.tie(NULL);

	cin >> s;
	someFunc(0, s.size());

	// 전부 괄호가 쳐져있다고 가정

	// 연산 기호를 중심으로,
	// 왼쪽 숫자를 스택에 넣고
	// 연산 기호는 킵
	// 오른쪽 숫자를 스택에 넣고
	// 왼쪽 - 오른쪽 - 기호 순으로 출력
}