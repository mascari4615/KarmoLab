//#define _CRT_SECURE_NO_WARNINGS
//#include <stdio.h>
//#include <stdlib.h>
//
//int word_count(char* string);
//
//void main()
//{
//	char* str = malloc(sizeof(char) * 256 + 1);
//	printf("Enter a string: ");
//	gets(str);
//	str = realloc(str, strlen(str) + 1);
//	printf("%d\n", word_count(str));
//	free(str);
//}
//
//int word_count(char* string)
//{
//	int count = 0;
//	char* ptr = strtok(string, " ");
//	while (ptr != NULL)
//	{
//		count++;
//		ptr = strtok(NULL, " ");
//	}
//	return count;
//}

#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <stdlib.h>

void main()
{
	int count = 0;
	char* str;
	while ((str = malloc(sizeof(char) * 254 + 1)) == NULL);
	printf("Enter a string: ");
	while (scanf("%s", str))
	{
		count++;
		if (getchar() == '\n') break;
	}
	printf("%d\n", count);
	free(str);
}

/*
void main()
{
	int count = 0, lenSum = 0;
	char* str = malloc(sizeof(char) * 254 + 1);
	printf("Enter a string: ");
	while (scanf("%s", str))
	{
		str = realloc(str, sizeof(char) * (256 - (lenSum += strlen(str) + count) - 2 + 1));
		count++;
		if (getchar() == '\n') break;
	}
	printf("%d\n", count);
	free(str);
}*/