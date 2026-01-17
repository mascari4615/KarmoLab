#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h> // sprintf
#include <stdlib.h> // malloc, free

void TryLeftStep(char* originStr, int remainStairs, int leftAmount);
void TryRightStep(char* originStr, int remainStairs);

// 문제 : n개의 계단을 오를 수 있는 경우의 수 출력 
// 조건 : 왼발 1 ~ 3칸, 오른발 1칸 
// 해결 : (간접)재귀함수 개념과 sprintf 함수 이용

// 원래 strcat, strcpy 함수를 사용하려했는데, sprintf 함수 하나로 해결할 수 있었음!
// printf : PRINT Formatted	: 서식 문자열을 콘솔에 출력
// sprintf : String PRINTF	: 서식 문자열을 char 배열(문자열)에 출력(저장?)

int main()
{
	int n;
	printf("How many steps do you want: "); scanf("%d", &n);

	// main함수에서 트리의 첫 가지를 뻗음
	char temp[1] = "";
	TryLeftStep(temp, n, 3);
	TryLeftStep(temp, n, 2);
	TryLeftStep(temp, n, 1);
	TryRightStep(temp, n);
	
	return 0;
}

// 왼발 오르기 시도 (매개변수로 오를 칸 수 받음, 1 ~ 3칸)
void TryLeftStep(char* originStr, int remainStairs, int stepAmount)
{
	char* totalStr = malloc(strlen(originStr) + 4);
	sprintf(totalStr, "%s%dL ", originStr, stepAmount);

	remainStairs -= stepAmount;
	if (remainStairs > 0) TryRightStep(totalStr, remainStairs);
	else if (remainStairs == 0) printf("%s\n", totalStr);

	free(totalStr);
}

// 오른발 오르기 시도 (오른발은 1칸 고정)
void TryRightStep(char* originStr, int remainStairs)
{
	char* totalStr = malloc(strlen(originStr) + 4);
	sprintf(totalStr, "%s1R ", originStr);

	if (--remainStairs > 0)
	{
		TryLeftStep(totalStr, remainStairs, 3);
		TryLeftStep(totalStr, remainStairs, 2);
		TryLeftStep(totalStr, remainStairs, 1);
	}
	else printf("%s\n", totalStr);

	free(totalStr);
}