using System;

class Program1157
{
    static void Main()
    {
        int[] count = new int[26];
        string s = Console.ReadLine();

        for (int i = 0; i < s.Length; i++)
        {
            count[s[i] >= 'a' ? s[i] - 'a' : s[i] - 'A']++;
        }

        int biggest = count[0];
        int biggestIndex = 0;
        bool isOnly = true;

        for (int i = 1; i < 26; i++)
        {
            if (count[i] > biggest)
            {
                biggest = count[i];
                biggestIndex = i;
                isOnly = true;
            }
            else if (count[i] == biggest)
            {
                isOnly = false;
            }
        }

        Console.WriteLine(isOnly ? (char)('A' + biggestIndex) : '?');
    }
}