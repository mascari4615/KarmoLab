using System;

class SubNumber
{
    static void Main()
    {
        string s = Console.ReadLine();
        string[] ss = s.Split();
        int Number1 = int.Parse(ss[0]);
        int Number2 = int.Parse(ss[1]);
        Console.WriteLine(Number1 - Number2);
    }
}