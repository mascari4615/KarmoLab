using namespace std;

// 문제
// return 빈병과 교환받은 콜라 합

// 조건
// 기본 n, 빈 병 a -> 새 병 b

int solution(int a, int b, int n)
{
    int answer = 0;
	while (n >= a)
	{
		int newCola = (n / a) * b;
		n = newCola + n % a;
		answer += newCola;
	}
    return answer;
}