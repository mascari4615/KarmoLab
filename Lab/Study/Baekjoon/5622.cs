using System;

class Program5622
{
    static void Main()
    {
        string s = Console.ReadLine();
        int time = 0;

        for (int i = 0; i < s.Length; i++)
        {
            if (s[i] >= 'A' && s[i] <= 'R')
            {
                time += 2 + ((s[i] - 'A') / 3 + 1);
            }
            else if (s[i] == 'S')
            {
                time += 8;
            }
            else if (s[i] >= 'T' && s[i] <= 'Y')
			{
                time += 2 + ((s[i] - 'A' - 1) / 3 + 1);
            }
            else if (s[i] == 'Z')
            {
                time += 10;
            }     
        }

        Console.WriteLine(time);
    }
}