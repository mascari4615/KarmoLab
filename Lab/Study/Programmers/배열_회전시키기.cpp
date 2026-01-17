#include <string>
#include <vector>
#include <algorithm>

using namespace std;

vector<int> solution(vector<int> numbers, string direction)
{
    rotate(numbers.begin(), (direction == "left" ? numbers.begin() + 1 : numbers.end() - 1), numbers.end());
    return numbers;
}