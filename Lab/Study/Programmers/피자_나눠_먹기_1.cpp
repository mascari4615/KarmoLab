#include <stdio.h>
#include <stdbool.h>
#include <stdlib.h>

int solution(int n)
{
    for (int i = 0; i < 100; i++)
    {
        if (n <= i * 7)
        {
            return i;
        }
    }
    return -1;
}