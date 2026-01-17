#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>

// 매개변수로 받은 정수를 뒤집어 반환하는 함수. (따로 구현한 사용자 지정 함수)
unsigned int GetReverse(unsigned int origin)
{
	unsigned int reverse = 0;
	for (unsigned int temp = origin; temp != 0; temp /= 10)
	{
		reverse = (reverse * 10) + temp % 10;
	}
	return reverse;
}

// 매개변수로 받은 포인터의 값에 거꾸로된 수를 더하는 함수. (반드시 구현해야 함, 문제조건)
void reverse_add(unsigned int* origin)
{
	*origin += GetReverse(*origin);
}

// 매개변수로 받은 정수가 회문인지 판단하는 함수. (반드시 구현해야 함, 문제조건)
// 회문이라면 1, 아니라면 0을 반환한다.
int is_palindrome(unsigned int num)
{
	return num == GetReverse(num);
}

void main()
{
	int r = 0; // 뒤집어 더한 횟수
	unsigned int p = 0; // 회문이 4,294,967,295보다 크지 않음 (가정)
	unsigned int* pPointer = &p;
	printf("Please enter a number : "); scanf("%d", &p);

	while (r++ < 1000) // 뒤집어 더하는 작업 1000번 이내 회문을 찾을 수 있음 (조건)
	{
		reverse_add(pPointer);
		if (is_palindrome(p)) break;
	}

	if (r < 1000) printf("%d %d", r, p);
	else printf("There is no palindrome.");
}

/* 필수 구현 함수가 없다면, 아래 같이 코드량을 줄일 수도 있음.
void main()
{
	int r = 0; // 뒤집어 더한 횟수
	unsigned int p = 0, reverse = 0, temp = 0; // 회문이 4,294,967,295보다 크지 않음 (가정)
	printf("Please enter a number : "); scanf("%d", &p);

	for (temp = p; temp != 0; temp /= 10)
		reverse = (reverse * 10) + temp % 10;

	while (++r < 1000) // 뒤집어 더하는 작업 1000번 이내 회문을 찾을 수 있음 (조건)
	{
		p += reverse;
		reverse = 0;
		for (temp = p; temp != 0; temp /= 10)
			reverse = (reverse * 10) + temp % 10;
		if (p == reverse) break;
	}

	if (r < 1000) printf("%d %d", r, p);
	else printf("There is no palindrome.");
}
*/