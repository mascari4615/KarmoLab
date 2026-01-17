#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void Find(char** inputs, int m, int n, char* word);

void main()
{
	int i, j, m, n, wordCount; // 1이상 40이하, 1이상 20이하
	char** inputs;
	char** words;

	scanf("%d %d", &m, &n);
	while ((inputs = (char**)malloc(sizeof(char*) * m)) == NULL);
	for (i = 0; i < m; i++)
	{
		while ((inputs[i] = (char*)malloc(sizeof(char) * n + 1)) == NULL);
		scanf("%s", inputs[i]);
		_strupr(inputs[i]);
	}

	scanf("%d", &wordCount);
	while ((words = (char**)malloc(sizeof(char*) * wordCount)) == NULL);
	for (i = 0; i < wordCount; i++)
	{
		while ((words[i] = (char*)malloc(sizeof(char) * 101)) == NULL);
		scanf("%s", words[i]);
		while ((words[i] = (char*)realloc(words[i], strlen(words[i]) + 1)) == NULL);
		_strupr(words[i]);
	}

	for (i = 0; i < wordCount; i++)
	{
		Find(inputs, m, n, words[i]);
		free(words[i]);
	}
	free(words);

	for (i = 0; i < m; i++)
		free(inputs[i]);
	free(inputs);
}

void Find(char** inputs, int m, int n, char* word)
{
	int r, c, ud, lr, i, wordLen = strlen(word);

	for (r = 0; r < m; r++)
	{
		for (c = 0; c < n; c++)
		{
			for (ud = -1; ud <= 1; ud++)
			{
				if ((ud == -1 && r - (wordLen - 1) < 0) || (ud == 1 && r + (wordLen - 1) > m))
					continue;

				for (lr = -1; lr <= 1; lr++)
				{
					if ((lr == -1 && c - (wordLen - 1)) || (lr == 1 && c + (wordLen - 1) > n))
						continue;

					for (i = 0; i < wordLen; i++)
						if (inputs[r + i * ud][c + i * lr] != word[i])
							goto EXIT;

					printf("%d %d\n", r + 1, c + 1);
				EXIT:;
				}
			}
		}
	}
}