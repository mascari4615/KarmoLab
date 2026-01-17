#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>

void sort3(int x, int y, int z)
{
	int arr[3] = { x, y, z };
	int temp;

	for (int i = 0; i < 2; i++)
	{
		for (int j = i + 1; j < 3; j++)
		{
			if (arr[i] > arr[j])
			{
				temp = arr[i];
				arr[i] = arr[j];
				arr[j] = temp;
			}
		}
	}

	int s = arr[0];
	int m = arr[1];
	int b = arr[2];

	printf("[Sorted Result] s: %d, m: %d, b: %d", s, m, b);
}

void main()
{
	int x = 0, y = 0, z = 0;

	puts("Enter three integer numbers (x, y, z)");
	printf("x: "); scanf("%d", &x);
	printf("y: "); scanf("%d", &y);
	printf("z: "); scanf("%d", &z);

	sort3(x, y, z);
}