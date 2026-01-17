#include <iostream>
#include <cmath>

using namespace std;

int main()
{
	int n;
	cin >> n;

	for (int y = 0; y < n; y++)
	{
		for (int x = 0; x < n; x++)
		{
			bool isStar = true;

			for (int i = n; i != 1; i /= 3)
			{
				if (((i / 3) <= x % i) &&
					((i / 3) * 2 - 1 >= x % i) &&
					((i / 3) <= y % i) &&
					((i / 3) * 2 - 1 >= y % i))
				{
					isStar = false;
					break;
				}
			}

			cout << (isStar ? "*" : " ");
		}

		cout << endl;
	}
}

//#include <iostream>
//#include <cmath>
//
//using namespace std;
//
//int main()
//{
//    int n;
//    // cin >> n;
//    scanf("%d", &n);
//
//    int a = 0;
//    for (int i = n; i != 1; i /= 3)
//    {
//        a++;
//    }
//
//    for (int y = 0; y < n; y++)
//    {
//        for (int x = 0; x < n; x++)
//        {
//            bool isStar = true;
//
//            /*for (int i = 0; i < a; i++)
//            {
//                if ((pow(3, i) <= (x % (int)(pow(3, i + 1)))) &&
//                    (pow(3, i) * 2 - 1 >= (x % (int)(pow(3, i + 1)))) &&
//                    (pow(3, i) <= (y % (int)(pow(3, i + 1)))) &&
//                    (pow(3, i) * 2 - 1 >= (y % (int)(pow(3, i + 1)))))
//                {
//                    isStar = false;
//                    break;
//                }
//            }*/
//
//            for (int i = a - 1; i >= 0; i--)
//            {
//                if ((pow(3, i) <= (x % (int)(pow(3, i + 1)))) &&
//                    (pow(3, i) * 2 - 1 >= (x % (int)(pow(3, i + 1)))) &&
//                    (pow(3, i) <= (y % (int)(pow(3, i + 1)))) &&
//                    (pow(3, i) * 2 - 1 >= (y % (int)(pow(3, i + 1)))))
//                {
//                    isStar = false;
//                    break;
//                }
//            }
//
//            printf((isStar ? "*" : " "));
//            // cout << (isStar ? "*" : " ");
//        }
//
//        printf("\n");
//        // cout << endl;
//    }
//}