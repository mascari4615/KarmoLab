#include <stdio.h>
#include <stdbool.h>
#include <stdlib.h>

int solution(int n, int k)
{
    return n * 12000 + (k - n / 10) * 2000;
}