#include <iostream>
#include <cmath>
#include <climits>

using namespace std;

int main()
{
	int n, m;
	scanf("%d %d", &n, &m);

	char** arr = new char* [n];
	for (int i = 0; i < n; i++)
	{
		arr[i] = new char[m];
		for (int j = 0; j < m; j++)
			scanf(" %c", &arr[i][j]);
	}

	char correctChar = 'B';
	int disCorrectCount = 0;
	int minDisCorrectCount = INT_MAX;

	for (int y = 0; y < n; y++)
	{
		for (int x = 0; x < m; x++)
		{
			if ((y + 8 > n) || (x + 8 > m))
				break;

			for (int i = 0; i < 8; i++)
			{
				for (int j = 0; j < 8; j++)
				{
					if (arr[y + i][x + j] != correctChar)
						disCorrectCount++;

					if (j == 7)
						break;

					correctChar = correctChar == 'B' ? 'W' : 'B';
				}
			}

			if (minDisCorrectCount > min(disCorrectCount, 64 - disCorrectCount))
				minDisCorrectCount = min(disCorrectCount, 64 - disCorrectCount);

			disCorrectCount = 0;
		}
	}

	printf("%d", minDisCorrectCount);
}