#include <string>
#include <vector>

using namespace std;

int solution(int n)
{
    for (int i = n; ; i += n)
    {
        if (i % 6 == 0)
            return i / 6;
    }
}