#include <iostream>
#include <cmath>

using namespace std;

int main()
{
	ios_base::sync_with_stdio(false);
	cin.tie(NULL);
	
	int x, y, w, h;
	cin >> x >> y >> w >> h;

	int left = x;
	int right = w - x;
	int up = h - y;
	int down = y;

	cout << min(min(min(left, right), up), down);
}