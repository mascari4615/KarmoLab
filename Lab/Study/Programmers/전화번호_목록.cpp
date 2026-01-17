#include <string>
#include <vector>
#include <algorithm>

using namespace std;

// 문제
// return !(한 번호가 다른 번호의 접두어인 경우)

// 조건
// 1 <= phone_book.size() <= 1,000,000, 중복 없음

// 배운 것
// 문자열.substr(시작, 길이) ㅡ 길이보다 짧으면 짧은대로
// 문자열.substr(시작) ㅡ 시작부터 마지막까지

// 다른 풀이
// (to_string(stoi(phone_book[i]) + 1) > phone_book[i + 1])
// 이 경우 ["00", "01"] 같이 0으로 시작하는 번호에 대해서는 대응이 되지 않음

bool solution(vector<string> phone_book)
{
	sort(phone_book.begin(), phone_book.end());

	for (int i = 0; i < phone_book.size() - 1; i++)
	{
		if (phone_book[i] == phone_book[i + 1].substr(0, phone_book[i].size()))
			return false;
	}

	return true;
}