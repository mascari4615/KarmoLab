using System;

class DivNumber
{
    static void Main()
    {
        string s = Console.ReadLine();
        string[] ss = s.Split();
        int Number1 = int.Parse(ss[0]);
        int Number2 = int.Parse(ss[1]);
        double asd = (double)Number1/(double)Number2;
        Console.WriteLine(asd);
    }
}