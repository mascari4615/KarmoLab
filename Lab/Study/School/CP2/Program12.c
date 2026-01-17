#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <stdlib.h> // malloc, free
#include <math.h> // floor

// 문제 : 여행 경비를 N빵하기 위해 서로 전달해하는 금액의 총합

int main()
{
	int studentCount;
	scanf("%d", &studentCount);

	float* expenses = malloc(studentCount * sizeof(float));
	float totalExpenses = 0; // 경비 총합

	// 친구들이 낸 경비를 친구 수만큼 입력받고, 동시 경비 총합에 더함
	for (int i = 0; i < studentCount; i++)
	{ 
		scanf("%f", &expenses[i]); 
		totalExpenses += expenses[i]; 
	}

	float expensesAverage = totalExpenses / studentCount; // 경비 평균
	float totalTransfer = 0; // 전달 금액 총합

	// 누군가 낸 경비가 경비 평균보다 많을 경우, 그만큼 다른 친구들에게 받아야하기 때문에, 그 차이를 전달 금액에 더함
	for (int i = 0; i < studentCount; i++)
		if (expenses[i] > expensesAverage)
			totalTransfer += floor((expenses[i] - expensesAverage) * 100) / 100;

	printf("%.2f", totalTransfer);
	free(expenses);

	return 0;
}