using System;

class Program2908
{
    static void Main()
    {
        string s = Console.ReadLine();
        string[] ss = s.Split(' ');
        string[] sss = new string[2] {"", ""};

        for (int i = 2; i >= 0; i--)
		{
            sss[0] += ss[0][i];
            sss[1] += ss[1][i];
        }

        int num1 = int.Parse(sss[0]);
        int num2 = int.Parse(sss[1]);

        Console.WriteLine(num1 > num2 ? num1 : num2);
    }
}