#include <iostream>

using namespace std;

int main(void)
{
    int n;
    cin >> n;
    for (int i = 1; i <= n; i++)
    {
        for (int j = 0; j < i; j++)
        {
            cout << '*'; 
        }
        cout << endl; 
    }
    return 0;
}

// 다른 분의 풀이
// for(int i = 1; i <= n; ++i)
// {
//     cout << string(i,'*') << endl;
// }