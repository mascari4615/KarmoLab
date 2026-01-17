using System;
using System.Collections.Generic;
using System.Linq;

public class Solution
{
	public string solution(string s)
	{
		List<int> ss = s.Split(' ').Select(x => int.Parse(x)).ToList();
		return $"{ss.Min()} {ss.Max()}";
	}

	// List<int> ss = s.Split(' ').Select(int.Parse).ToList(); 
	// 이렇게도 쓸 수 있구나

	// Sort 기본 비교 연산자가 뭐지..?
	// Min Max 최대 2n 인데 요것보다 빠르려나
	// 빠르다면 Sort 하고 First Last 쓸텐데

	// 빅오 표기법에서 'log N'이 상용로그를 뜻하는 게 아니라, 밑이 어찌되건 상수라 상관없어서 생략해둔거구나
	// 빅오 표기법은 실제 러닝타임이 아니라
	// 계속해서 데이터 량(n)이 증가함에 따른 러닝타임 증가율을 표현하기 위한 것 (최악의 경우를 생각하는 것)
	// 실제 러닝타임과 다를 수 있다는 걸 다시 인지해야겠다

	// int.Parse 함수가 - + 기호도 처리하는구나
}