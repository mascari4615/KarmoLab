#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <string.h>
#include <malloc.h>

int IsCouple(char* string);
int KillAllCouple(char* string);
void SortString(char* string);

// char* inputs[n]로 쓰고 싶었지만, VS에서는 가변 길이 배열(VLA)을 지원하지 않았음.. 
// 때문에 이중 포인터를 사용하고, malloc 함수를 이용해 동적 할당하는 방법 사용

void main()
{
	int n, i, j;
	printf("Enter N : ");
	scanf("%d", &n);

	char** inputs = NULL, temp[100] = { NULL, };
	while ((inputs = (char**)malloc(sizeof(char*) * n)) == NULL);

	for (i = 0; i < n; i++)
	{
		scanf("%s", temp);
		while ((inputs[i] = (char*)malloc(strlen(temp) + 1)) == NULL);
		strcpy(inputs[i], temp);
	}

	printf("\n");

	for (i = 0; i < n; i++)
	{
		if (KillAllCouple(inputs[i]))
			printf("Good");
		else
		{
			SortString(inputs[i]);

			// 짝이 없는 알파벳 거꾸로 출력
			for (j = 0; j < strlen(inputs[i]); j++)
				if (inputs[i][j] != '#')
					printf("%c", inputs[i][j]);
		}
		printf("\n");

		// 문자열을 더 사용하지 않기 때문에 할당 해제
		free(inputs[i]);
	}

	// 이중 포인터도 할당 해제
	free(inputs);
}

// 매개변수로 받은 문자열 안에 짝인 알파벳이 있는지 확인
int IsCouple(char* string)
{
	int i, j;

	// 짝인 알파벳이 있는지 찾아 return
	for (i = 0; i < strlen(string) - 1; i++)
		for (j = i + 1; j < strlen(string); j++)
			if (string[i] == string[j] && string[i] != '#')
				return 1;

	return 0;
}

// 매개변수로 받은 문자열 안에 있는 모든 알파벳 쌍을 #으로 변경
// 문자열이 모두 #이 되면 1, 아니면 0 반환
int KillAllCouple(char* string)
{
	int coupleCount = 0, i, j;

		// 짝이 있는 알파벳을 찾아 #으로 바꾸고, coupleCount++
		for (i = 0; i < strlen(string) - 1; i++)
		{
			if (string[i] == '#')
				continue;

			for (j = i + 1; j < strlen(string); j++)
			{
				if (string[i] == '#')
					continue;

				if (string[i] == string[j])
				{
					string[i] = string[j] = '#';
					coupleCount++;
					break;
				}
			}
		}
	}

	return strlen(string) == coupleCount * 2;
}

void SortString(char* string)
{
	char temp;

	for (int i = 0; i < strlen(string) - 1; i++)
	{
		for (int j = i + 1; j < strlen(string); j++)
		{
			if (string[i] > string[j])
			{
				temp = string[i];
				string[i] = string[j];
				string[j] = temp;
			}
		}
	}
}