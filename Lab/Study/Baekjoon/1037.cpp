#include <iostream>
#include <string>
#include <vector>
#include <algorithm>

using namespace std;

int main()
{
	ios_base::sync_with_stdio(false);
	cin.tie(NULL);
	cout.tie(NULL);

	int t;
	cin >> t;

	int max = 0;
	int min = 1000000;
	for (int i = 0; i < t; i++)
	{
		int input;
		cin >> input;

		if (max < input)
			max = input;

		if (min > input)
			min = input;
	}

	cout << max * min;
}