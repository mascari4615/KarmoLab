using System;

class Program2941
{
    static void Main()
    {
        string s = Console.ReadLine();
        int count = 0;

        for (int i = 0; i < s.Length; i++)
        {
            if (s[i] == '=' || s[i] == '-')
                continue;

            count++;

            switch (s[i])
            {
                case 'c':
                    if (i + 1 < s.Length)
                        if (s[i + 1] == '=' || s[i + 1] == '-')
                            i++;
                    break;
                case 'd':
                    if (i + 2 < s.Length)
                        if (s[i + 1] == 'z' && s[i + 2] == '=')
                            i += 2;
                    break;
                case 'l':
                case 'n':
                    if (i + 1 < s.Length)
                        if (s[i + 1] == 'j')
                            i++;
                    break;
                case 's':
                case 'z':
                    if (i + 1 < s.Length)
                        if (s[i + 1] == '=')
                            i++;
                    break;
            }

        }

        Console.WriteLine(count);
    }
}