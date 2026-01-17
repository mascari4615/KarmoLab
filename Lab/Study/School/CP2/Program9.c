#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <stdbool.h>
#include <math.h>

void processSieve(int* primes, int upper, int lower);
void getBoundaries(int* upper, int* lower);
bool isUpperBiggerThenLower(int upper, int lower);
void showPrimes(int* primes, int upper, int lower);

int main()
{
	// 소수인지 아닌지 여부를 나타내는 배열 만약 값이 1이면 소수, 그렇지 않으면 소수가 아님.
	int primes[50001] = { NULL, }; 
	// 뭐시기 소수 출력을 위한 범위의 최대값, 최소값
	int upper = 0, lower = 0;

	getBoundaries(&upper, &lower);
	processSieve(primes, upper, lower);
	showPrimes(primes, upper, lower);

	return 0;
}

void getBoundaries(int* upper, int* lower)
{
	do
	{
		do printf("Please enter the lower boundary (between 1 and 50000): ");
		while (!scanf("%d", lower) || (*lower < 1 || *lower > 50000));

		do printf("Please enter the upper boundary (between 1 and 50000): ");
		while (!scanf("%d", upper) || (*upper < 1 || *upper > 50000));

	} while (!isUpperBiggerThenLower(*upper, *lower));
}

bool isUpperBiggerThenLower(int upper, int lower)
{
	if (upper > lower) return true;
	else { printf("Your upper boundary cannot be smaller than your lower boundary"); return false; }
}

void processSieve(int* primes, int upper, int lower)
{
	// 2부터 upper의 제곱근까지의 모든 수 num까지 검사
	for (int num = 2; num < sqrt(upper); num++)
	{
		// 만약 num이 아무런 표시가 되지 않았다면
		if (primes[num] == NULL)
		{
			// 이 수는 소수, 1로 표시
			primes[num] = 1;

			// 또, 소수의 배수들은 소수가 아님, -1로 표시
			for (int multiples = num * num; multiples < upper; multiples += num)
			{
				primes[multiples] = -1;
			}
		}
	}

	// 표시되지 않는 수는 소수, 1로 표시
	// lower보다 작고, upper보다 큰 수는 필요하지 않기 때문에 검사에서 제외
	for (int index = lower; index < upper; index++)
	{
		if (primes[index] == NULL)
		{
			primes[index] = 1;
		}
	}
}

void showPrimes(int* primes, int upper, int lower)
{
	int count = 0;
	printf("Here are all of the sexy prime pairs in the range %d to %d:\n", lower, upper);
	for (int i = lower; i <= upper - 6; i++)
	{
		if (primes[i] == 1 && primes[i + 6] == 1)
		{
			printf("%d and %d\n", i, i + 6);
			count++;
		}
	}
	printf("There were %d sexy prime pairs displayed between %d and %d", count, lower, upper);
}