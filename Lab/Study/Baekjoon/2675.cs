using System;

class Program2675
{
    static void Main()
    {
        int n = int.Parse(Console.ReadLine());

        for (int i = 0; i < n; i++)
        {
            string s = Console.ReadLine();
            int repeat = s[0] - '0';
            for (int j = 2; j < s.Length; j++)
            {
                for (int k = 0; k < repeat; k++)
                {
                    Console.Write(s[j]);
                }
            }
            Console.Write("\n");
        }
    }
}