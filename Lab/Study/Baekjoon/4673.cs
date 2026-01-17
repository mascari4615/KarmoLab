using System;
using System.Text;

class Program4673
{
    static void Main()
    {
        bool[] isNotSelfNumber = new bool[10001];
        StringBuilder sb = new();

        for (int i = 1; i <= 10000; i++)
        {
            int n = i;
            for (int temp = i; temp != 0; temp /= 10)
            {
                n += temp % 10;
            }
             
            if (n > 10000)
			{
                continue;
			}
            else
			{
                isNotSelfNumber[n] = true;
            }
        }

        for (int i = 1; i <= 10000; i++)
        {
            if (isNotSelfNumber[i] == false)
            {
                sb.Append(i + "\n");
            }
        }

        Console.WriteLine(sb.ToString());
    }
}