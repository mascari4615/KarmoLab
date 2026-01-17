#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>

void sum_diff_mul(int x, int y);

void main()
{
	int x = 0, y = 0;
	char yn = "";

	// X, Y 입력
Input_XY:
	printf(" =====================================================\n");
	printf(" 두 정수 x와 y의 값을 입력해주세요. (이때, x는 y보다 크다)\n");

	// X 입력
Input_X:
	printf(" x : ");
	if (!scanf("%d", &x))
	{
		printf(" 올바르지 않은 x값 입력입니다. 다시 입력해주세요. \n");
		while (getchar() != '\n') {}
		goto Input_X;
	}
	while (getchar() != '\n') {}

	// Y 입력
Input_Y:
	printf(" y : ");
	if (!scanf("%d", &y))
	{
		printf(" 올바르지 않은 y값 입력입니다. 다시 입력해주세요. \n");
		while (getchar() != '\n') {}
		goto Input_Y;
	}
	while (getchar() != '\n') {}

	// X > Y 조건 확인
	printf("\n");
	if (x <= y)
	{
		if (x < y) printf(" x가 y보다 작거나 같습니다.");
		else if (x == y) printf(" x가 y와 같습니다.");
		printf(" x는 y보다 커야합니다. 다시 입력해주세요.\n\n");
		goto Input_XY;
	}

	// 함수 실행
	sum_diff_mul(x, y);

	// 프로그램 재실행 여부 확인
Input_YN:
	printf(" 프로그램을 다시 실행하시겠습니까 ? (Y/N) : ");
	scanf("%c", &yn);
	while (getchar() != '\n') {}
	if (yn == 'Y' || yn == 'y')
	{
		printf(" 다시 실행합니다.\n\n");
		goto Input_XY;
	}
	else if (yn == 'N' || yn == 'n')
		printf(" 프로그램을 종료합니다. 감사합니다.\n\n");
	else
	{
		printf(" 올바르지 않은 입력입니다. 다시 입력해주세요.\n\n");
		goto Input_YN;
	}

	return 0;
}

void sum_diff_mul(int x, int y)
{
	int sum = x + y;
	int diff = x - y;
	int mul = x * y;

	printf(" - 결과 -\n");
	printf(" 합(SUM) \t: %d + %d = %d\n", x, y, sum);
	printf(" 차(DIFF) \t: %d - %d = %d\n", x, y, diff);
	printf(" 곱(MUL) \t: %d * %d = %d\n\n", x, y, mul);
}