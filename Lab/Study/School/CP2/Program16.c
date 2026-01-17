#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int IsAnagram(char* word1, char* word2);

void main()
{
	int n, i;
	char** inputs, * word1, * word2;
	scanf("%d", &n);
	while (getchar() != '\n');

	inputs = (char**)malloc(sizeof(char*) * n);
	for (i = 0; i < n; i++)
	{
		inputs[i] = (char*)malloc(sizeof(char) * 202);
		scanf("%[^\n]s", inputs[i]);
		while (getchar() != '\n');
		inputs[i] = (char*)realloc(inputs[i], strlen(inputs[i]) + 1);
	}

	printf("\n");

	for (i = 0; i < n; i++)
	{
		word1 = strtok(inputs[i], " ");
		word2 = strtok(NULL, " ");
		printf("%s & %s are", word1, word2);
		printf("%sanagrams.\n", IsAnagram(word1, word2) ? " " : " NOT ");
	}

	for (i = 0; i < n; i++)
		free(inputs[i]);
	free(inputs);
}

int IsAnagram(char* word1, char* word2)
{
	if (strlen(word1) != strlen(word2)) return 0;

	int i, j, kill = 0, check = 0;
	for (i = 0; i < strlen(word1); i++)
	{
		check = 0;
		for (j = 0; j < strlen(word2); j++)
		{
			if (word1[i] == word2[j])
			{
				word2[j] = '#';
				kill++;
				check = 1;
				break;
			}
		}
		if (check == 0) return 0;
	}

	return strlen(word1) - kill == 0;
}