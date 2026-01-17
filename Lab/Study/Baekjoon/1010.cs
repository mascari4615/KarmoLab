using System;
using static System.Console;

class Program
{
    static void Main()
    {
        for (int i = int.Parse(ReadLine()); i > 0; i--)
        {
            string[] ss = ReadLine().Split(" ");
            int n = int.Parse(ss[0]), m = int.Parse(ss[1]);
            Int64 total = 1, fac = 1;
            int _n = n > m - n ? m - n : n;
            for (int j = 0; j < _n; j++) total *= (m - j);
            for (Int64 k = _n; k > 0; k--) fac *= k;
            total /= fac;
            WriteLine(total);
        }
    }
}