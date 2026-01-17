#include <string>
#include <vector>
#include <iostream>

using namespace std;

int solution(vector<vector<int>> board, vector<int> moves)
{
	int answer = 0;
	vector<int> basket;
	for (int i = 0; i < moves.size(); i++)
	{
		for (int j = 0; j < board[0].size(); j++)
		{
			if (board[j][moves[i] - 1] != 0)
			{
				basket.push_back(board[j][moves[i] - 1]);

				while (basket.back() == basket[basket.size() - 2])
				{
					basket.pop_back();
					basket.pop_back();
					answer += 2;
				}

				board[j][moves[i] - 1] = 0;
				break;
			}
		}
	}

	return answer;
}