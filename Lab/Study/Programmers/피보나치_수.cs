using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	private Dictionary<int, int> dic = new Dictionary<int, int>() { { 0, 0 }, { 1, 1 } };
	public int solution(int n) => Recursive(n) % 1234567;
	private int Recursive(int n) => dic[n]
		= (dic.ContainsKey(n - 1) ? dic[n - 1] : dic[n - 1] = Recursive(n - 1) % 1234567)
		+ (dic.ContainsKey(n - 2) ? dic[n - 2] : dic[n - 2] = Recursive(n - 2) % 1234567);

	// ulong 써도 안 풀려서.. 힌트 확인
	
	// 나머지 연산의 성질
	// (a + b) % c = ((a % c) + (b % c)) % c

	// 다른 분 풀이 보는데 신기한 키워드가 있어서 메모
	// 오버플로 언더플로 검사를 컴파일 단계에서 해주는 키워드
	// checked <=> unchecked

	// System.Numerics에 들어있는 BigInteger 라는 것도 있음
}