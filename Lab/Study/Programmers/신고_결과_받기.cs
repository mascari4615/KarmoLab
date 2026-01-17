using System;
using System.Collections.Generic;

public class Solution
{
    public int[] solution(string[] id_list, string[] report, int k) 
    {
        int[] answer = new int[id_list.Length];
        string[,] reportData = new string[report.Length, 2];
        
        for (int i = 0; i < report.Length; i++)
        {
            string[] s = report[i].Split(" ");
            reportData[i, 0] = s[0]; 
            reportData[i, 1] = s[1]; 
        }
            
        foreach (string id in id_list)
        {
            bool[] reporterCheck = new bool[id_list.Length];
            int reportCount = 0;
            
            for (int i = 0; i < report.Length; i++)
            {
                if (id == reportData[i, 1])
                {
                    int temp = Array.IndexOf(id_list, reportData[i, 0]);
                    
                    if (reporterCheck[temp] == false)
                    {
                        reporterCheck[temp] = true;
                        reportCount++;
                    }
                }
            }
            
            if (reportCount >= k)
            {
                 for (int i = 0; i < id_list.Length; i++)
                 {
                     if (reporterCheck[i])
                         answer[i]++;
                 }
            }
        }
        return answer;
    }
}