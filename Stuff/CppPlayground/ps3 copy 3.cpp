#include <iostream>
#include <algorithm>
#include <math.h>
#include <vector>

typedef long long ll;

using namespace std;

const int MX = 55;

int n;

int partyLeader[MX];
bool knowTheTruth[MX];

bool adj[MX][MX];
int parent[MX];

void dfs(int cur)
{
	for (int c = 1; c <= n; c++)
	{
		if (adj[cur][c] == false)
			continue;

		if (parent[cur] == c)
			continue;

		parent[c] = cur;
		dfs(c);
	}
}

int findRoot(int some)
{
	if (parent[some] == 0)
		return some;

	knowTheTruth[some] = knowTheTruth[parent[some]] = knowTheTruth[parent[some]] | knowTheTruth[some];

	return parent[some] = findRoot(parent[some]);
}

void unionRoot(int x, int y)
{
	x = findRoot(x);
	y = findRoot(y);

	if (x != y)
		parent[x] = y;
}

int main()
{
	ios_base::sync_with_stdio(false);
	cin.tie(NULL);
	cout.tie(NULL);

	int m, kttCount;
	cin >> n >> m >> kttCount;

	int ktt;
	while (kttCount--)
	{
		cin >> ktt;
		knowTheTruth[ktt] = true;
	}

	// 각 파티에 대해, 파티원들끼리 연결
	int partyPeopleCount, partyPeople;
	for (int i = 0; i < m; i++)
	{
		vector<int> party{};
		cin >> partyPeopleCount;

		for (int j = 0; j < partyPeopleCount; j++)
		{
			cin >> partyPeople;
			party.push_back(partyPeople);
		}

		sort(party.begin(), party.end());

		// 연결
		for (int j = 1; j < party.size(); j++)
		{
			if (parent[party[j]] == 0)
			{
				parent[party[j]] = party[j - 1];
			}
			else
			{
				unionRoot(party[j], party[j - 1]);
			}
		}

		partyLeader[i] = party[0];
	}

	for (int i = 1; i <= n; i++)
	{
		// dfs(i);
		// cout << i << "parent : " << parent[i] << "\n";
	}

	for (int i = 2; i <= n; i++)
	{
		// unionRoot(i, i - 1);
	}

	// 분리 집합 확인
	for (int i = n; i > 0; i--)
		knowTheTruth[i] = knowTheTruth[findRoot(i)];

	// 안전한 파티 확인
	int safePartyCount = 0;
	for (int i = 0; i < m; i++)
	{
		if (knowTheTruth[partyLeader[i]] == false)
			safePartyCount++;
	}

	cout << safePartyCount;
}