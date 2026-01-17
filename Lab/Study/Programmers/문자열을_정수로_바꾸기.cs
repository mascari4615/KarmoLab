using System;

public class Solution 
{
    public int solution(string s) 
    {
        return int.Parse(s.Trim(new char[]{'+', '-'})) * (s[0] == '-' ? -1 : 1);;
    }
}