#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct InputData {
	char** inputs;
	int maxRow;
	int maxCol;
} inputData;

typedef struct Direction {
	int vertical;
	int horizontal;
} direction;

direction const NW = { .vertical = -1, .horizontal = -1 };
direction const N = { .vertical = -1, .horizontal = 0 };
direction const NE = { .vertical = -1, .horizontal = 1 };
direction const E = { .vertical = 0, .horizontal = 1 };
direction const SE = { .vertical = 1, .horizontal = 1 };
direction const S = { .vertical = 1, .horizontal = 0 };
direction const SW = { .vertical = 1, .horizontal = -1 };
direction const W = { .vertical = 0, .horizontal = -1 };

void Find(inputData inputData, char* word);
void FindWord(inputData inputData, char* word, int r, int c, direction d);
int CantSearchThatDirection(inputData inputData, int wordLen, int r, int c, direction d);

void main()
{
	int i, j, m, n, wordCount; // 1이상 40이하, 1이상 20이하
	char** inputs;
	char** words;
	inputData inputData;

	scanf("%d %d", &m, &n);
	while ((inputs = (char**)malloc(sizeof(char*) * m)) == NULL);
	for (i = 0; i < m; i++)
	{
		while ((inputs[i] = (char*)malloc(sizeof(char) * n + 1)) == NULL);
		scanf("%s", inputs[i]);
		_strupr(inputs[i]);
	}

	inputData.inputs = inputs;
	inputData.maxRow = m;
	inputData.maxCol = n;

	scanf("%d", &wordCount);
	while ((words = (char**)malloc(sizeof(char*) * wordCount)) == NULL);
	for (i = 0; i < wordCount; i++)
	{
		while ((words[i] = (char*)malloc(sizeof(char) * (100 + 1))) == NULL);
		scanf("%s", words[i]);
		while ((words[i] = (char*)realloc(words[i], strlen(words[i]) + 1)) == NULL);
		_strupr(words[i]);
	}

	for (i = 0; i < wordCount; i++)
		Find(inputData, words[i]);

	for (i = 0; i < wordCount; i++)
		free(words[i]);
	free(words);

	for (i = 0; i < m; i++)
		free(inputs[i]);
	free(inputs);
}

void Find(inputData inputData, char* word)
{
	int r, c;

	for (r = 0; r < inputData.maxRow; r++)
	{
		for (c = 0; c < inputData.maxCol; c++)
		{
			if (inputData.inputs[r][c] != word[0])
				continue;
			
			FindWord(inputData, word, r, c, N);
			FindWord(inputData, word, r, c, NW);
			FindWord(inputData, word, r, c, W);
			FindWord(inputData, word, r, c, SW);
			FindWord(inputData, word, r, c, S);
			FindWord(inputData, word, r, c, SE);
			FindWord(inputData, word, r, c, E);
			FindWord(inputData, word, r, c, NE);
		}
	}
}

void FindWord(inputData inputData, char* word, int r, int c, direction d)
{
	int i, wordLen = strlen(word);
	char curChar;

	if (CantSearchThatDirection(inputData, wordLen, r, c, d))
		return;

	for (i = 1; i < wordLen; i++)
	{
		curChar = inputData.inputs[r + i * d.vertical][c + i * d.horizontal];
		if (curChar != word[i])
			return;
	}

	printf("%d %d\n", r + 1, c + 1);
}

int CantSearchThatDirection(inputData inputData, int wordLen, int r, int c, direction d)
{
	return (d.vertical == -1 && r - (wordLen - 1) < 0) ||
		   (d.vertical == 1 && r + (wordLen - 1) > inputData.maxRow) ||
		   (d.horizontal == -1 && c - (wordLen - 1) < 0) ||
		   (d.horizontal == 1 && c + (wordLen - 1) > inputData.maxCol);
}