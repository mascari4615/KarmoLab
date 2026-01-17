using System.Text;

public class Solution 
{
    public string solution(string s, int n) 
    {
        StringBuilder sb = new StringBuilder();
        foreach (char c in s)
        {
            sb.Append(c < 'A' ? c : (char)(c <= 'Z'
                ? c + n > 'Z' ? 'A' + (c + n - 'Z' - 1) : c + n
                : c + n > 'z' ? 'a' + (c + n - 'z' - 1) : c + n));
        }
        return sb.ToString();
    }
}