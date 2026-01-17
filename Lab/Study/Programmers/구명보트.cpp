#include <vector>
#include <algorithm>

using namespace std;

int solution(vector<int> people, int limit)
{
    sort(people.begin(), people.end());
    int boatCount = 0;
    for (int lightest = 0, heaviest = people.size() - 1; lightest <= heaviest; heaviest--)
    {
        if (people[lightest] + people[heaviest] <= limit)
            lightest++;
        boatCount++;
    }
    return boatCount;
}