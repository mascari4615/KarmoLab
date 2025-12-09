using UnityEngine;
using TMPro;
using System;
using System.Text.RegularExpressions;
using System.IO;

public class StringManager : MonoBehaviour
{
	[SerializeField] private TMP_InputField inputFieldMain;
	[SerializeField] private TMP_InputField inputFieldSub;

	public static void Main_KarmoFormat()
	{
		Console.WriteLine(NoSpace(@"ㅁ	ㅋ	ㄹ	ㅁ	ㅇ	ㅊ	ㄷ	ㅇ
ㅂ	ㄲ	ㅈ	ㅂ	ㄱ	ㄷ	ㅈ	ㅇ
ㅁ	ㄹ	ㅇ	ㅂ	ㅎ	ㅇ	ㅅ	ㄱ
ㅊ	ㄱ	ㅇ	ㄲ	ㄴ	ㄹ	ㅎ	ㅂ
ㄱ	ㅌ	ㅅ	ㄱ	ㅊ	ㅎ	ㅈ	ㅅ
ㄸ	ㅂ	ㅋ	ㄷ	ㅋ	ㅌ	ㅊ	ㄹ
ㄹ	ㅇ	ㄹ	ㄱ	ㅇ	ㄱ	ㅍ	ㅇ
ㅁ	ㅈ	ㅅ	ㄹ	ㅇ	ㅎ	ㅊ	ㅍ"));

		// YoutubePlaylistDataRegex.Regex(args[1]);
	}

	public static string NoSpace(string s)
	{
		return s.Replace(" ", "").Replace("\t", "").Replace("\n", "").Replace("\r", "");
	}

	// 유튜브 플레이리스트 데이터를 정리
	public static void Regex(string filePath)
	{
		// 텍스트 파일을 읽어서, 특정 정규식이 포함된 라인을 찾고, 해당 라인을 수정해서 저장하는 예제

		// 1. 텍스트 파일 읽기
		string[] lines = File.ReadAllLines(filePath);

		// 2. 정규식을 이용한 라인 찾기
		Regex titleRegex = new Regex(@"""title"": ""([^""]*)""");
		Regex videoIdRegex = new Regex(@"""videoId"":\s*""([^""]+)""");

		for (int i = 0; i < lines.Length; i++)
		{
			Match titleMatch = titleRegex.Match(lines[i]);
			Match videoIdMatch = videoIdRegex.Match(lines[i]);

			if (titleMatch.Success)
			{
				Console.Write($"- [{titleMatch.Groups[1].Value}]");
			}

			if (videoIdMatch.Success)
			{
				Console.Write($"(https://youtu.be/{videoIdMatch.Groups[1].Value})\n");
			}
		}

		Console.WriteLine("Done");
	}
}
