using System;
using System.Linq;
using System.Collections.Generic;

public class Solution
{
	public int[] solution(int[] fees, string[] records)
	{
		Dictionary<string, int> recordDic = new Dictionary<string, int>();
		Dictionary<string, int> minuteDic = new Dictionary<string, int>();
		Dictionary<string, int> answerDic = new Dictionary<string, int>();

		foreach (var record in records)
		{
			string[] data = record.Split(' ');
			string[] time = data[0].Split(':');
			int timeToMinute = int.Parse(time[0]) * 60 + int.Parse(time[1]);

			if (data[2] == "IN")
			{
				recordDic.Add(data[1], timeToMinute);
				minuteDic.TryAdd(data[1], 0);
				answerDic.TryAdd(data[1], 0);
			}
			else
			{
				minuteDic[data[1]] += timeToMinute - recordDic[data[1]];
				recordDic.Remove(data[1]);
			}
		}

		foreach (var record in recordDic)
			minuteDic[record.Key] += 23 * 60 + 59 - record.Value;

		foreach (var data in minuteDic)
			answerDic[data.Key] += fees[3] * (int)Math.Ceiling((float)Math.Clamp(data.Value - fees[0], 0, int.MaxValue) / fees[2]);

		List<KeyValuePair<string, int>> temp = answerDic.ToList();
		temp.Sort((x, y) => x.Key.CompareTo(y.Key));
		return temp.Select(x => x.Value + fees[1]).ToArray();
	}

	// 문제를 잘못 이해해서 오래 걸렸다
	// 1. 출차 할 때 마다 요금을 계산하는 줄 알았는데, 하루에 누적된 주차 시간을 통틀어 계산하는 거였다.
	// 2. 위 처럼 생각해서, 기본 요금이 출차 할 때 마다 붙는 줄 알았다.
}