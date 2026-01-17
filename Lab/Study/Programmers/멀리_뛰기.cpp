#include <string>
#include <vector>

using namespace std;

long memo[2000];

long Recursive(long block, long sum, int n, int answer)
{
	if (block + sum == n) return answer + 1;
	else if (block + sum > n) return answer;
        
    if (memo[sum + block] == 0)
        memo[sum + block] = (
            Recursive(1, block + sum, n, answer) % 1234567 +
            Recursive(2, block + sum, n, answer) % 1234567);
        
    return memo[sum + block];
}

long solution(int n)
{
	return (Recursive(1, 0, n, 0) +
            Recursive(2, 0, n, 0)) % 1234567;
}

// 똑같은 코드여도 C#은 .20ms, 30MB, C++은 .01ms, 4MB
// 확실히 속도 차이가 있구나