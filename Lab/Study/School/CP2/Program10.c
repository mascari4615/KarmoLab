#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <stdbool.h>
#define GRIDSIZE 30

// Reset the two-dimensional array
void clearGrid(int(*grid)[GRIDSIZE])
{
	for (int i = 0; i < GRIDSIZE; i++)
		for (int j = 0; j < GRIDSIZE; j++)
			grid[i][j] = 0;
}

void setup(int(*board)[GRIDSIZE], char which)
{
	clearGrid(board);

	if (which == 'q')
	{
		board[5][1] = 1;
		board[5][2] = 1;
		board[6][3] = 1;
		board[7][4] = 1;
		board[8][4] = 1;
		board[9][4] = 1;
		board[10][3] = 1;
		board[11][2] = 1;
		board[11][1] = 1;
	}
	else
	{
		board[17][0] = 1;
		board[16][1] = 1;
		board[15][1] = 1;
		board[16][2] = 1;
		board[17][2] = 1;
	}
}

void displayGrid(int(*grid)[GRIDSIZE])
{
	printf("  ");
	for (int x = 1; x <= GRIDSIZE; x++)
	{
		if ((x / 10) != 0) printf("%d", x / 10);
		else printf(" ");
	}

	printf("\n  ");
	for (int x = 1; x <= GRIDSIZE; x++) printf("%d", x % 10);

	printf("\n");
	for (int r = 0; r < GRIDSIZE; r++)
	{
		printf("%d", r + 1);
		if (r + 1 < 10) printf(" ");

		for (int c = 0; c < GRIDSIZE; c++)
		{
			if (grid[r][c] == 1) printf("*");
			else printf(" ");
		}
		printf("\n");
	}
}

// Count the number of neighbors
int countNeighbors(int(*grid)[GRIDSIZE], int row, int col)
{
	int count = 0;

	bool isRowMin = row == 0;
	bool isRowMax = row == GRIDSIZE - 1;
	bool isColMin = col == 0;
	bool isColMax = col == GRIDSIZE - 1;

	// 윗 행 검사
	if (!isRowMin)
	{
		if (!isColMin) if (grid[row - 1][col - 1]) count++;
		if (grid[row - 1][col]) count++;
		if (!isColMax) if (grid[row - 1][col + 1]) count++;
	}

	// 가운데 행 검사
	if (!isColMax) if (grid[row][col + 1]) count++;
	if (!isColMin) if (grid[row][col - 1]) count++;

	// 오른쪽 행 검사
	if (!isRowMax)
	{
		if (!isColMin) if (grid[row + 1][col - 1]) count++;
		if (grid[row + 1][col]) count++;
		if (!isColMax) if (grid[row + 1][col + 1]) count++;
	}

	return count;

	/*
	for (int colt = col - 1; colt <= col + 1; colt++)
	{
		if (colt == -1 || colt == GRIDSIZE) continue;

		for (int rowt = row - 1; rowt <= row + 1; rowt++)
		{
			if (rowt == -1 || rowt == GRIDSIZE) continue;

			if (grid[rowt][colt]) count++;
		}
	}*/
}

// Generate the next generation of the simulation
void genNextGrid(int(*grid)[GRIDSIZE])
{
	int nextGen[GRIDSIZE][GRIDSIZE];
	int count = 0;

	for (int i = 0; i < GRIDSIZE; i++)
		for (int j = 0; j < GRIDSIZE; j++)
		{
			count = countNeighbors(grid, i, j);
			nextGen[i][j] = (grid[i][j] && (count == 2 || count == 3)) || (!grid[i][j] && count == 3);
		}

	for (int i = 0; i < GRIDSIZE; i++)
		for (int j = 0; j < GRIDSIZE; j++)
			grid[i][j] = nextGen[i][j];
}

void main()
{
	int board[GRIDSIZE][GRIDSIZE];
	char choice;
	int x = 1;

	do printf("Start with the (q)ueen bee shuttle or the (g)lider pattern? ");
	while (!scanf("%c", &choice) && choice != 'q' && choice != 'g');

	setup(board, choice);

	do
	{
		printf("Viewing generation #%d:\n\n", x++);
		displayGrid(board);
		genNextGrid(board);
		printf("\n(q)uit or any other key + ENTER to continue: ");
		while (getchar() != '\n'); // VS2015 이상 버전에서 fflush(stdin)는 동작되지 않음, Why? 비표준
		scanf("%c", &choice);
	} while (choice != 'q');
}
