using System;

class Program
{
    static void Main()
    {
        int origin = int.Parse(Console.ReadLine()), temp = origin, stack = 0;
        
        do 
        {
            temp = ((temp / 10 + temp % 10) % 10) + temp % 10 * 10;
            stack++;
        }
        while (temp != origin);
        
        Console.WriteLine(stack);
    }
}