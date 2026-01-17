using System;
using System.Linq;
using System.Collections.Generic;

public class Solution 
{
    public int solution(int n, int[] lost, int[] reserve)
    {
        foreach (int l in lost)
        {
            foreach (int r in reserve)
            {
                if (l == r)
                {
                    lost = lost.Where(x => x != l).ToArray();
                    reserve = reserve.Where(x => x != r).ToArray();
                    break;
                }
            }
        }

        bool[] borrow = new bool[reserve.Length];
        
        foreach (int l in lost)
        {
            for (int i = 0; i <  reserve.Length; i++)
            {
                if ((l - 1 == reserve[i] || l + 1 == reserve[i]) && !borrow[i])
                {
                    borrow[i] = true;
                    break;
                }
            }
        }

        return n - lost.Length + borrow.Count();
    }
}