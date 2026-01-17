using System;

class Program1065
{
    static void Main()
    {
        int input = int.Parse(Console.ReadLine());

        if (input < 100)
        {
            Console.WriteLine(input);
        }
        else
        {
            int count = 99;

            for (int i = 100; i <= input; i++)
            {
                if (IsHansu(i))
                {
                    count++;
                }
            }

            Console.WriteLine(count);
        }
    }

    static bool IsHansu(int num)
    {
        int diff = 0;

        for (int temp = num; temp >= 10; temp /= 10)
        {
            int big = (temp / 10) % 10;
            int small = temp % 10;

            int curDiff = big - small;

            if (temp == num)
            {
                diff = curDiff;
            }
            else if (diff != curDiff)
            {
                return false;
            }
        }

        return true;
    }
}