#include <string>
#include <vector>

using namespace std;

int solution(int price)
{
    if (price >= 500000)
        price = (int)(price * ((float)80 / 100));
    else if (price >= 300000)
        price = (int)(price * ((float)90 / 100));
    else if (price >= 100000)
        price = (int)(price * ((float)95 / 100));
    return price;
}