class Program4344
{
    // https://www.acmicpc.net/problem/4344

    static void Main()
    {
        int caseNum = int.Parse(Console.ReadLine());

        for (int i = 0; i < caseNum; i++)
        {
            int[] scores = Array.ConvertAll(Console.ReadLine().Split(), int.Parse);
            int studentNum = scores[0], goodStudentNum = 0;
            float sum = 0, average;

            for (int j = 1; j <= studentNum; j++)
                sum += scores[j];

            average = (float)sum / studentNum;

            for (int j = 1; j <= studentNum; j++)
                if (scores[j] > average)
                    goodStudentNum++;

            Console.WriteLine("{0:F3}%", (float)goodStudentNum / studentNum * 100);
        }
    }
}

/*
 * 숏코딩
using System;
using static System.Console;
using System.Linq;

int c = int.Parse(ReadLine());

while (c-- > 0)
{
    var a = Array.ConvertAll(ReadLine().Split(), int.Parse).Skip(1).ToArray();
    WriteLine("{0:F3}%", (float)a.Count(s => s > a.Average()) / a.Length * 100);
}

*/