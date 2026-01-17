using namespace std;

int solution(int order)
{
    int answer = 0;
    for (int temp = order; temp != 0; temp /= 10)
    {
        if ((temp % 10 != 0) && (temp % 10 % 3 == 0))
            answer++;
    }

    return answer;
}