#include <bits/stdc++.h>
using namespace std;

const bool Debug = 0;

const int MX = 21;
int world[MX][MX];
bool visited[MX][MX];
// int shortTime[MX][MX];

int n;
pair<int, int> sharkPos;
int sharkSize = 2;
int totalTime = 0;
bool eat = false;
int eatStack = 0;

int dx[4]{-1, 0, 1, 0};
int dy[4]{0, -1, 0, 1};

void moveAndEat(int nextTime, int r, int c)
{
	eatStack++;
	if (eatStack == sharkSize)
	{
		sharkSize++;
		eatStack = 0;
	}

	world[r][c] = 0;
	sharkPos = {r, c};
	totalTime += nextTime;
	eat = true;

	if (Debug)
	{
		cout << "Eat [" << r << ", " << c << "] totalTime : " << totalTime << " eatStack : " << eatStack << "\n";
	}
}

int main()
{
	ios_base::sync_with_stdio(false);
	cin.tie(NULL);
	cout.tie(NULL);

	cin >> n;

	for (int i = 0; i < n; i++)
	{
		for (int j = 0; j < n; j++)
		{
			cin >> world[i][j];

			if (world[i][j] == 9)
			{
				sharkPos = {i, j};
				world[i][j] = 0;
			}
		}
	}

	while (true)
	{
		queue<pair<int, pair<int, int>>> q;

		// Init
		for (int i = 0; i < n; i++)
		{
			for (int j = 0; j < n; j++)
			{
				// shortTime[i][j] = n * n;
				visited[i][j] = false;
			}
		}
		q.push({0, sharkPos});
		visited[sharkPos.first][sharkPos.second] = true;
		if (Debug)
		{
			cout << "Start [" << sharkPos.first << ", " << sharkPos.second << "]\n";
		}
		// 가장 가까운 먹이 찾아가기
		pair<int, int> nearest;
		// int shortTime = n * n;
		eat = false;

		// BFS
		while (q.empty() == false)
		{
			pair<int, pair<int, int>> cur = q.front();
			q.pop();

			int curTime = cur.first;
			int x = cur.second.first;
			int y = cur.second.second;

			if (Debug)
			{
				cout << "Try [" << x << ", " << y << "]\n";
			}

			for (int i = 0; i < 4; i++)
			{
				int tx = x + dx[i];
				int ty = y + dy[i];

				if (((tx >= 0) && (tx < n) && (ty >= 0) && (ty < n)) == false)
					continue;

				if (visited[tx][ty])
					continue;

				if (world[tx][ty] <= sharkSize)
				{
					if (world[tx][ty] != 0 && world[tx][ty] < sharkSize)
					{
						moveAndEat(curTime + 1, tx, ty);
						break;
					}
					visited[tx][ty] = true;
					if (Debug)
						cout << "Push [" << tx << ", " << ty << "]\n";
					q.push({curTime + 1, {tx, ty}});
				}
			}

			if (eat)
				break;
		}

		// if (shortTime == n * n)
		if (eat == false)
		{
			cout << totalTime;
			return 0;
		}
	}
}