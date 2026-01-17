#include <iostream>
#include <cmath>

using namespace std;

void Recursive(int originN, int n, int y, int x, char** array);
void MarkTriangle(int y, int n, char** array);

int main()
{
	int n;
	cin >> n;

	char** array = new char* [n];
	for (int i = 0; i < n; i++)
	{
		array[i] = new char[n * 2 - 1];
		for (int j = 0; j < 2 * n - 1; j++)
			array[i][j] = ' ';
	}

	if (n == 3)
	{
		MarkTriangle(0, 2, array);
	}
	else
	{
		Recursive(n, n, 0, n - 1, array);
		Recursive(n, n, n / 2, n - 1 - (n / 2), array);
		Recursive(n, n, n / 2, n - 1 + (n / 2), array);
	}

	for (int i = 0; i < n; i++)
	{
		for (int j = 0; j < 2 * n - 1; j++)
			cout << array[i][j];

		cout << endl;
	}
}

void Recursive(int originN, int n, int y, int x, char** array)
{
	n /= 2;

	if (n == 3)
	{
		MarkTriangle(y, x, array);
	}
	else
	{
		Recursive(originN, n, y, x, array);
		Recursive(originN, n, y + n / 2, x - (n / 2), array);
		Recursive(originN, n, y + n / 2, x + (n / 2), array);
	}
}

void MarkTriangle(int y, int x, char** array)
{
	array[y][x] = '*';
	array[y + 1][x - 1] = '*';
	array[y + 1][x + 1] = '*';
	array[y + 2][x - 2] = '*';
	array[y + 2][x - 1] = '*';
	array[y + 2][x] = '*';
	array[y + 2][x + 1] = '*';
	array[y + 2][x + 2] = '*';
}