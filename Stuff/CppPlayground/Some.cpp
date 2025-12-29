#include <bits/stdc++.h>
using namespace std;

int main()
{
	ios_base::sync_with_stdio(false);
	cin.tie(NULL);
	cout.tie(NULL);

	int l, a, b, c, d;
	cin >> l >> a >> b >> c >> d;
	cout << (l - max((a + c - 1) / c, (b + d - 1) / d));
}