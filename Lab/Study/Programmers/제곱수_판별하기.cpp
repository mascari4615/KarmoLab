#include <string>
#include <vector>
#include <cmath>

using namespace std;

int solution(int n) 
{
    return (pow((int)sqrt(n), 2) == n) ? 1 : 2;
}