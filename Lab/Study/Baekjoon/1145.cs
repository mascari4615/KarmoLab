using System;

class Program
{
    static void Main()
    {
        string[] ss = Console.ReadLine().Split(" ");
        int answer = 0;
        while (true)
        {
            int score = 0;
            answer++;

            foreach (var s in ss) if (answer % int.Parse(s) == 0) score++;
            if (score >= 3) break;
        }
        Console.WriteLine(answer);
    }
}