using System;
using System.Text;
using System.Linq;

public class Solution
{
    public int solution(int n, int k)
    {
        return ConvertToDiffrentBase(n, k).Split('0').Where(x => (x != string.Empty) && IsPrimeNum(Int64.Parse(x))).Count();
    }
    
    private bool IsPrimeNum(long num)
    {
        if (num <= 1) return false;
        
        for (int i = 2; i <= Math.Sqrt(num); i++ )
        {
            if (num % i == 0)
                return false;
        }
        return true;
    }
    
    private string ConvertToDiffrentBase(int origin, int newBase)
    {
        StringBuilder sb = new StringBuilder();
        while (origin != 0)
        {
            sb.Append(origin % newBase);
            origin /= newBase;
        }
        return new string(sb.ToString().Reverse().ToArray());
    }
    
    // Convert.ToString() 은 2 8 10 16 Base 만 지원했다
    // 문자열 거꾸로 만들기, new string(문자열.Reverse().ToArray())
    
    // 왜 런타임 에러가 뜨나 했더니, 소수 판별할 때 num 이 int 범위를 넘는 경우가 있었다
    // 질문하기 글 보고 알았음..
}