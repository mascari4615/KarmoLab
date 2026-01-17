#include <iostream>
#include <algorithm>
#include <math.h>

typedef long long ll;

using namespace std;

const int MX = 200005;
pair<char, int> arr[MX];
int n;

int prevIndex(int index)
{
	for (int i = index - 1; i >= 0; i--)
	{
		if (arr[i].first != '.')
			return i;
	}
	return -1;
}

int nextIndex(int index)
{
	for (int i = index + 1; i < n; i++)
	{
		if (arr[i].first != '.')
			return i;
	}
	return -1;
}

void printAll()
{
	cout << "\n____\n";
	for (int i = 0; i < n; i++)
	{
		cout << arr[i].first << " _ " << arr[i].second << "\n";
	}
	cout << "____\n";
}

int main()
{
	ios_base::sync_with_stdio(false);
	cin.tie(NULL);
	cout.tie(NULL);

	// int n, q;
	int q;
	cin >> n >> q;

	int lastIndex = 0;
	char lastChar = '.';

	for (int i = 0; i < n; i++)
	{
		char c;
		cin >> c;

		if (lastChar == c)
		{
			arr[lastIndex].second++;

			arr[i] = pair<char, int>{'.', 0};
		}
		else
		{
			lastChar = c;
			lastIndex = i;

			arr[i] = pair<char, int>{c, 1};
		}
	}

	// printAll();

	while (q--)
	{
		lastIndex = 0;
		lastChar = '.';

		int command, l, r;
		cin >> command >> l >> r;

		// cout << "command : " << command << ", l : " << l << ", r : " << r << "\n";

		l--;
		r--;

		if (command == 1)
		{
			int alphabetSetCount = 1;

			for (int i = l; i >= 0; i--)
			{
				if (arr[i].first != '.')
				{
					lastIndex = i;
					lastChar = arr[i].first;
					break;
				}
			}

			for (int i = l + 1; i <= r;)
			{
				if (arr[i].first != '.')
				{
					alphabetSetCount++;

					lastIndex = i;
					lastChar = arr[i].first;

					i += arr[i].second;
				}
				else
				{
					i++;
				}
			}

			// cout << alphabetSetCount << "\n";
			cout << alphabetSetCount << " ";
		}
		else if (command == 2)
		{
			// index:l을 포함하는 알파벳 묶음 찾기
			// l에 있을 수도 있음
			if (arr[l].first == '.')
			{
				int prev = prevIndex(l);

				// 만약 있으면 l 전까지 자르기
				if (prev != -1)
				{
					// cout << "A\n";
					int lastChar = arr[prev].first;
					int lastIndex = prev;

					int diff = (lastIndex + arr[lastIndex].second) - l;
					// cout << lastIndex << "_" << arr[lastIndex].second << "_" << diff << "\n";
					arr[lastIndex].second -= diff;

					// cout << arr[lastIndex].first;

					arr[l] = pair<char, int>{(arr[lastIndex].first), diff};
				}
			}

			// index:r을 포함하는 알파벳 묶음 찾기
			// r에 있을 수도 있음
			if (arr[r].first == '.')
			{
				int prev = prevIndex(r);

				// 만약 있으면 r까지 자르기
				if (prev != -1 && prev != l)
				{
					// cout << "B\n";
					int lastChar = arr[prev].first;
					int lastIndex = prev;

					int diff = (lastIndex + arr[lastIndex].second) - r;
					// cout << lastIndex << "_" << arr[lastIndex].second << "_" << diff << "\n";
					arr[lastIndex].second -= diff;

					// cout << arr[lastIndex].first;

					arr[r + 1] = pair<char, int>{(arr[lastIndex].first), diff};
				}
			}
			else if (arr[r].second > 1)
			{
				// cout << "C\n";
				int lastChar = arr[r].first;
				int lastIndex = r;

				arr[r + 1] = pair<char, int>{(arr[lastIndex].first), arr[r].second - 1};
				arr[r].second = 1;
			}

			lastChar = arr[l].first;
			lastIndex = l;

			// cout << "l : " << l << "\n";
			for (int i = lastIndex; i <= r;)
			{
				if (arr[i].first != '.')
				{
					if (arr[i].first != lastChar)
					{
					}
					else
					{
					}

					if (arr[i].first == 'Z')
						arr[i].first = 'A';
					else
						arr[i].first++;

					i += arr[i].second;

					if (i <= r)
						lastIndex = i;
				}
				else
				{
					i++;
				}
				// cout << "i : " << i << "\n";
			}
			// cout << "Last : " << lastIndex << "\n";

			int next = nextIndex(lastIndex);
			if (next != -1)
			{
				if (arr[lastIndex].first == arr[next].first)
				{
					arr[lastIndex].second += arr[next].second;
					arr[next] = pair<char, int>{'.', 0};
				}
			}

			int prev = prevIndex(l);
			if (prev != -1)
			{
				if (arr[l].first == arr[prev].first)
				{
					arr[prev].second += arr[l].second;
					arr[l] = pair<char, int>{'.', 0};
				}
			}

			// printAll();
			// break;
		}
	}
}