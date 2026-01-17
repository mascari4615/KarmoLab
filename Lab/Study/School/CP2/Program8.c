#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <math.h>

// 저장하는 약수들의 최대 개수
#define FACTORS_LENGTH 10

int testPerfect(int number, int* factors);
void printFactors(int number);

int main()
{
	int n = 0, input = 0; // 반복 횟수, 입력값
	printf("How many numbers would you like to test? ");
	scanf("%d", &n);
	for (int i = 0; i < n; i++)
	{
		printf("Please enter a possible perfect number: ");
		scanf("%d", &input);
		printFactors(input);
		printf("\n\n");
	}
	return 0;
}

// 완전수 판별
int testPerfect(int number, int* factors)
{
	// 완전수는 자기 자신을 제외한 양의 정수를 더했을 때 자기 자신이 됨
	// 자기 자신을 제외한 수를 더하기 위해, 
	int sum = 0;
	for (int i = 1; i < FACTORS_LENGTH; i++)
	{
		if (factors[i] == NULL) break;
		sum += factors[i];
	}

	if (sum == number) return 1;
	else return 0;
}

// 넘겨받는 수가 완전수라면, 약수 출력
void printFactors(int number)
{
	// 넘겨받은 수가 완전수인지 판별하기 위해서든, 약수를 출력하기 위해서든 먼저 약수를 구해야함

	int factors[FACTORS_LENGTH] = { NULL, };
	int i = 0;
	int numberSqrt = (int)sqrt(number);;

	// 넘겨받은 수의 약수를 찾아 배열에 넣는 반복문
	// 어떤 자연수 n의 약수는, n의 제곱근 이하인 약수만 구하면, n을 그 약수로 나눠 구할 수 있음
	// 예) 28의 제곱근 5.3 => 28, 14, 7 | 4, 2, 1
	for (int curFactor = 1; curFactor <= numberSqrt; curFactor++)
	{
		// 나누어 떨어지면 약수
		if (number % curFactor == 0)
		{
			// (n의 제곱근 이하인) 약수 저장
			factors[i++] = curFactor;
			// 만약 curFactor가 제곱근일 경우, 같은 숫자가 중복되어 저장되는 것을 방지
			if (curFactor != number / curFactor)
			{
				// (n의 제곱근 이하인) 약수로 n을 나눈 또 다른 약수 저장
				factors[i++] = number / curFactor;
			}
		}
	}

	// 약수들을 내림차순으로 정렬
	int temp = 0;
	for (int j = 0; j < i - 1; j++)
	{
		for (int k = j + 1; k < i; k++)
		{
			if (factors[j] < factors[k])
			{
				temp = factors[j];
				factors[j] = factors[k];
				factors[k] = temp;
			}
		}
	}

	printf("%d:", number);

	// 만약 넘겨받은 수가 정수라면
	if (testPerfect(number, factors))
	{
		// 반복문을 통해 1번째 약수 부터 출력 (입력 받은 수는 제외하고 출력하라는 문제 조건, 0번째 약수는 자기 자신이기 때문)
		for (int j = 1; j < FACTORS_LENGTH; j++)
		{
			if (factors[j] == NULL) break;
			printf("%d ", factors[j]);
		}
	}
	// 넘겨받은 수가 정수가 아니라면
	else
	{
		printf("NOT PERFECT");
	}
}