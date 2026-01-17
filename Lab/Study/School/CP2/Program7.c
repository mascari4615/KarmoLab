#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

void get_date(char* birthday[]);
int validate_date(int year, int month, int day);
void crunch_date(int number);
void show_numerology(int number);

void main()
{
	// 문자 포인터 (문자열) 배열
	char* birthday[3] = { "", "", "" };
	get_date(birthday);
	
	// 문자열을 정수로 바꿔주는 함수를 이용해 변수를 초기화합니다.
	int month = atoi(birthday[0]);
	int day = atoi(birthday[1]);
	int year = atoi(birthday[2]);

	int num = validate_date(year, month, day);

	// 반환 받은 값이 0이 아니라면, 즉 올바르게 입력되었다면
	if (num)
	{
		printf("Welcome to the numerogy report for %d/%d/%d :\n", month, day, year);
		crunch_date(num);
	}
}

// 생년월일을 입력받아 년도, 월, 일로 구분하여 처리
void get_date(char* birthday[])
{
	char input[15];
	printf("Enter the birth date (mm / dd / yyyy) : ");
	scanf("%[^\n]", input);

	// 입력받은 값을 " / " 로 나누고, 반환 받은 문자열의 주소값을 문자 포인터 배열에 저장합니다.
	char* result = strtok(input, " / ");
	while (result != NULL)
	{
		birthday = result;
		birthday++;
		printf("%s", birthday);
		result = strtok(NULL, " / ");
	}
}

// 날짜가 올바르게 입력되었는지 확인하고, 그렇다면 모두 더한 값, 아니라면 0을 반환합니다.
int validate_date(int year, int month, int day)
{
	// 1880년부터 2280년까지로 제한한다는 문제 조건
	if (year < 1880 || year > 2280)
	{
		printf("Bad year : %d\n", year);
		null 포인터 저장
			0은 다 쓸 수 잇음
			gets s 문자열
		return 0;
	}

	// 입력된 달의 마지막 날짜를 구하고, 동시에 입력된 달이 올바른지 확인
	int lastDayOfMonth;
	switch (month)
	{
		case 2:
			if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0)
				lastDayOfMonth = 29;
			else
				lastDayOfMonth = 28;
			break;
		case 4:
		case 6:
		case 9:
		case 11:
			lastDayOfMonth = 30;
			break;
		case 1:
		case 3:
		case 5:
		case 7:
		case 8:
		case 10:
		case 12:
			lastDayOfMonth = 31;
			break;
		default:
			printf("Bad month : %d\n", month);
			return 0;
	}

	// 입력된 날짜가 올바른지 확인
	if (day <= 0 || day > lastDayOfMonth)
	{
		printf("Bad day for %d/%d : %d\n", month, year, day);
		return 0;
	}

	int number = year + month + day;
	return number;
}

// 넘겨받은 숫자의 모든 자릿수를 10보다 작아질 때까지 합칩니다.
void crunch_date(int number)
{
	int nSum = 0;
	do
	{
		nSum = 0;
		while (number)
		{
			nSum += number % 10;
			number /= 10;
		}
		number = nSum;
	} while (nSum >= 10);

	show_numerology(nSum);
}

// 넘겨받은 숫자에 따른 운세를 출력합니다.
void show_numerology(int number)
{
	printf(":%d: ", number);

	switch (number)
	{
		case 1:
			printf("Neither give cherries to pigs nor advice to a fool.");
			break;
		case 2:
			printf("Expect harmony and balance.");
			break;
		case 3:
			printf("Your dearest dream is coming true.");
			break;
		case 4:
			printf("Take a leap of faith.");
			break;
		case 5:
			printf("Your sweetheat may be too beautiful for words, but not for arguments.");
			break;
		case 6:
			printf("Rid your life of negative energy.");
			break;
		case 7:
			printf("Prepare for a spiritual awakening.");
			break;
		case 8:
			printf("You are almost there.");
			break;
		case 9:
			printf("Share your wisdom with the world.");
			break;
		case 0:
			printf("Your are on the right path");
			break;
	}
}