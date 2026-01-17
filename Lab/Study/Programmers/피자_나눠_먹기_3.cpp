#include <string>
#include <vector>

using namespace std;

int solution(int slice, int n)
{
    for (int i = 1; i <= 100; i++)
    {
        if (n <= i * slice)
            return i;
    }
    return -1;
}