using System;

class Program1152
{
    static void Main()
    {
        string s = Console.ReadLine();
        int count = 0;

        for (int i = 1; i < s.Length - 1; i++)
        {
            if (s[i] == ' ')
            {
                count++;
            }
        }

        Console.WriteLine(count + ((s.Length == 1 && s[0] == ' ') ? 0 : 1));
    }
}