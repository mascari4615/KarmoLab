#include <string>
#include <vector>
#include <algorithm>

using namespace std;

bool compare(pair<int, float> a, pair<int, float> b)
{
    if (a.second == b.second)  // 실패율이 같다면
        return a.first < b.first;  // 이름(int) 기준 오름차순
    else
        return a.second > b.second; // 실패율(float) 기준 내림차순
}

vector<int> solution(int N, vector<int> stages) {
    vector<int> answer(N);

    vector<int> all(N);
    vector<int> success(N);
    vector<pair<int, float>> temp(N);

    // all, success 업데이트
    for (int i = 0; i < stages.size(); i++)
    {
        for (int j = 0; j < stages[i] && j < N; j++)
            all[j]++;
        for (int j = 0; j < stages[i] - 1; j++)
            success[j]++;
    }

    // 스테이지와 실패율 매칭 pair
    for (int i = 0; i < N; i++)
    {
        // 아무도 도달한적이 없는 스테이지라면, 즉 all[i] = 0 이라면 실패율은 0 으로.
        float fail = (all[i] == 0 ? 0 : (all[i] - success[i]) / (float)all[i]);
        temp[i] = make_pair(i + 1, fail);
    }

    sort(temp.begin(), temp.end(), compare); // 실패율 기준 정렬

    for (int i = 0; i < N; i++)
        answer[i] = temp[i].first;

    return answer;
}


// 출처 : https://ansohxxn.github.io/programmers/50/