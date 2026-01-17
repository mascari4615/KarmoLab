/*using System;
using System.Collections.Generic;

class Program18258
{
    static void Main()
    {
        int n = int.Parse(Console.ReadLine());
        Queue queue = new Queue();

        for (int i = 0; i < n; i++)
        {
            string s = Console.ReadLine();
            switch (s)
            {
                case "pop":
                    Console.WriteLine(queue.Pop());
                    break;
                case "size":
                    Console.WriteLine(queue.GetSize());
                    break;
                case "empty":
                    Console.WriteLine(queue.IsEmpty());
                    break;
                case "front":
                    Console.WriteLine(queue.GetFront());
                    break;
                case "back":
                    Console.WriteLine(queue.GetBack());
                    break;
                default:
                    if (s.Contains("push"))
                        queue.Push(int.Parse(s.Substring(5)));
                    break;
            }
        }
    }
}

class Queue
{
    List<int> queue;

    public void Push(int num)
    {
        if (queue == null)
        {
            queue = new List<int> { num };
        }
        else
        {
            queue.Add(num);
        }
    }

    public int Pop()
    {
        if (queue.Count == 0) return -1;
        queue.Remove(0);
        return pop;
    }

    public int GetSize() => queue.Count;
    public int IsEmpty() => queue.Count == 0 ? 1 : 0;
    public int GetFront() => queue == null ? -1 : queue[0];
    public int GetBack() => queue == null ? -1 : queue[queue.Count - 1];
}*/