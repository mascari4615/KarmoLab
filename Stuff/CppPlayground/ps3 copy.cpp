#include <iostream>
#include <algorithm>
#include <math.h>
#include <vector>

typedef long long ll;

using namespace std;

const int MX = 55;

int partyLeader[MX];
bool knowTheTruth[MX];

int parent[MX];

// 루트 반환 (0 아님)
int findRoot(int some)
{
	if (parent[some] == 0)
		return some;

	knowTheTruth[some] = knowTheTruth[parent[some]] = knowTheTruth[parent[some]] | knowTheTruth[some];

	return parent[some] = findRoot(parent[some]);
}

// 메모리 초과 : 무한 재귀?

// 무한 재귀 조건 :
// parent[some]이 0이 아니고 (0이면 if에서 걸리니까)
//   parent[some]이 some과 똑같거나 (직접재귀)
//   parent[a] = b, parent[b] = a (간접재귀)

// 직접재귀가 가능한가?

void unionRoot(int x, int y)
{
	x = findRoot(x);
	y = findRoot(y);

	if (x != y)
	{
		// 여기서 직접 재귀가 나려면 (parent[some] == some)
		//
		parent[x] = y;
	}

	// if (x > y)
	// 	parent[x] = y;
	// else
	// 	parent[y] = x;
}

int main()
{
	ios_base::sync_with_stdio(false);
	cin.tie(NULL);
	cout.tie(NULL);

	int n, m, kttCount;
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
			int curP = party[j];
			int prevP = party[j - 1];

			if (parent[curP] == 0)
			{
				// 여기서 직접 재귀 (parent[curP] == curP) 가능성 X (반드시 다른 사람일테니까)
				parent[curP] = prevP;
			}
			else
			{
				unionRoot(curP, prevP);
			}
		}

		partyLeader[i] = party[0];
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