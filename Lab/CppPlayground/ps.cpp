#include <iostream>
#include <algorithm>
#include <math.h>
#include <queue>
#include <vector>
#include <tuple>

typedef long long ll;

using namespace std;

const int MX = 1005;
int n, m;

int nearWalls[MX][MX];

int arr2[MX][MX][2];
int visit2[MX][MX][2];

int arr[MX][MX];
int len[MX][MX];
bool visit[MX][MX];

bool canReach;

int dx[4]{1, -1, 0, 0};
int dy[4]{0, 0, 1, -1};

void bfs2(int startX, int startY, int destX, int destY)
{
	queue<tuple<int, int, int>> q{};
	q.push(tuple<int, int, int>{startX, startY, 0});

	while (q.empty() == false)
	{
		tuple<int, int, int> cur = q.front();
		q.pop();

		int x = get<0>(cur);
		int y = get<1>(cur);
		int di = get<2>(cur);

		if (x == destX && y == destY)
			break;

		for (int i = 0; i < 4; i++)
		{
			int newX = x + dx[i];
			int newY = y + dy[i];
			int v = visit2[newX][newY][di];

			if (newX < 0 || newX > n || newY < 0 || newY > m || v > 0)
				continue;

			visit2[newX][newY][di] = visit2[x][y][di] + 1;

			if (arr[newX][newY] == 1)
				q.push(tuple<int, int, int>{x + 1, y, 1});
			else
				q.push(tuple<int, int, int>{x + 1, y, 0});
		}
	}
}

void bfs(int startX, int startY, int destX, int destY, bool sans)
{
	queue<pair<pair<int, int>, int>> q{};
	q.push(pair<pair<int, int>, int>{pair<int, int>{startX, startY}, 1});

	while (q.empty() == false)
	{
		pair<pair<int, int>, int> cur = q.front();
		q.pop();

		int x = cur.first.first;
		int y = cur.first.second;
		int d = cur.second;

		len[x][y] = min(len[x][y], d);

		if (x == destX && y == destY)
		{
			canReach = true;
			break;
		}

		// if (visit[x][y] == true)
		// 	continue;
		// visit[x][y] = true;

		// if (sans == true && destX == 0)
		// 	cout << x << " " << y << "\n";

		for (int i = 0; i < 4; i++)
		{
			int newX = x + dx[i];
			int newY = y + dy[i];

			if (newX < 0 || newX > n || newY < 0 || newY > m || visit[newX][newY])
				continue;

			if (arr[newX][newY] == 1)
			{
				if (sans)
				{
					visit[newX][newY] = true;
					nearWalls[newX][newY]++;
				}
			}
			else
			{
				visit[newX][newY] = true;
				q.push(pair<pair<int, int>, int>{pair<int, int>{newX, newY}, d + 1});
			}
		}
	}
}

void clearStuff()
{
	for (int i = 0; i < n; i++)
		for (int j = 0; j < m; j++)
		{
			visit[i][j] = false;
			// len[i][j] = 2147483647;
		}
}

void clearStuff2()
{
	for (int i = 0; i < n; i++)
		for (int j = 0; j < m; j++)
		{
			visit[i][j] = false;
			len[i][j] = 2147483647;
		}
}

int main()
{
	ios_base::sync_with_stdio(false);
	cin.tie(NULL);
	cout.tie(NULL);

	cin >> n >> m;

	for (int i = 0; i < n; i++)
	{
		string s;
		cin >> s;

		for (int j = 0; j < m; j++)
		{
			arr[i][j] = s[j] - '0';
			len[i][j] = 2147483647;
		}
	}

	// for (int i = 0; i < n; i++)
	// {
	// 	for (int j = 0; j < m; j++)
	// 		cout << arr[i][j];
	// 	cout << "\n";
	// }

	bfs(0, 0, n - 1, m - 1, true);

	if (canReach)
	{
		int minLen = len[n - 1][m - 1];

		for (int i = 0; i < n; i++)
		{
			for (int j = 0; j < m; j++)
			{
				if (nearWalls[i][j] == 1)
				{
					// cout << "*" << i << " " << j << " : " << nearWalls[i][j] << "\n";

					clearStuff();

					arr[i][j] = 0;
					bfs(0, 0, n - 1, m - 1, false);
					arr[i][j] = 1;

					if (len[n - 1][m - 1] == 0)
						continue;

					minLen = min(minLen, len[n - 1][m - 1]);
				}
			}
		}
		cout << (minLen == 2147483647 ? -1 : minLen);
	}
	else
	{
		clearStuff();
		bfs(n - 1, m - 1, 0, 0, true);
		// clearStuff();

		int minLen = 2147483647;
		for (int i = 0; i < n; i++)
		{
			for (int j = 0; j < m; j++)
			{
				if (nearWalls[i][j] == 2)
				{
					// cout << "*" << i << " " << j << " : " << nearWalls[i][j] << "\n";

					// clearStuff();

					// arr[i][j] = 0;
					// bfs(0, 0, n - 1, m - 1, false);
					// arr[i][j] = 1;

					// if (len[n - 1][m - 1] == 0)
					// 	continue;
					int curLen = 0;

					if (i - 1 >= 0)
					{
						// cout << len[i - 1][i] << "\n";
						if (len[i - 1][j] != 2147483647)
							curLen += len[i - 1][j];
					}

					if (i + 1 < n)
					{
						// cout << len[i + 1][i] << "\n";
						if (len[i + 1][j] != 2147483647)
							curLen += len[i + 1][j];
					}

					if (j - 1 >= 0)
					{
						// cout << len[i - 1][i] << "\n";
						if (len[i][j - 1] != 2147483647)
							curLen += len[i][j - 1];
					}

					if (j + 1 < m)
					{
						// 	cout << len[i - 1][i] << "\n";
						if (len[i][j + 1] != 2147483647)
							curLen += len[i][j + 1];
					}

					// minLen = min(minLen, len[n - 1][m - 1]);
					minLen = min(minLen, curLen + 1);
				}
			}
		}

		cout << (minLen == 2147483647 ? -1 : minLen);

		// 011
		// 100
	}
}
