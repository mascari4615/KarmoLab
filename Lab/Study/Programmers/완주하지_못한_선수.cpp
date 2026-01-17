#include <string>
#include <vector>
#include <algorithm>

using namespace std;

string solution(vector<string> participant, vector<string> completion)
{
	if (completion.size() == 0)
		return participant[0];

	sort(participant.begin(), participant.end());
	sort(completion.begin(), completion.end());

	for (int i = 0; i < participant.size(); i++)
	{
		if (participant[i] != completion[i])
		{
			return participant[i];
		}
	}
}