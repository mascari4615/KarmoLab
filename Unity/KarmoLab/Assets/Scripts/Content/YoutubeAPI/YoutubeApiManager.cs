using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using TMPro;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace KarmoLab
{
	public class YoutubeApiManager : ButtonContent
	{
		private readonly List<VideoData> allVideoData = new();

		protected override Dictionary<int, (Delegate function, string functionName)> InitializeFunctionMap()
		{
			return new Dictionary<int, (Delegate function, string functionName)>
			{
				{ 1, ((FunctionWithTwoInputs)SomeFunc, nameof(SomeFunc)) },
			};
		}

		private void SomeFunc(string playlistID, string apiID)
		{
			if (string.IsNullOrEmpty(playlistID) || string.IsNullOrEmpty(apiID))
			{
				MLog.Log("Please enter the playlist ID and API key.");
				return;
			}

			allVideoData.Clear();
			StartCoroutine(GetPlaylistItems(playlistID, apiID));
		}

		private IEnumerator GetPlaylistItems(string playlistId, string apiKey, string pageToken = null)
		{
			string url = $"https://www.googleapis.com/youtube/v3/playlistItems" +
						 $"?part=snippet" +
						 $"&maxResults=50" +
						 $"&playlistId={playlistId}" +
						 $"&key={apiKey}";

			if (!string.IsNullOrEmpty(pageToken))
			{
				url += $"&pageToken={pageToken}";
			}

			using (UnityWebRequest request = UnityWebRequest.Get(url))
			{
				request.SetRequestHeader("Content-Type", "application/json");

				yield return request.SendWebRequest();

				if (request.result != UnityWebRequest.Result.Success)
				{
					MLog.Log($"API 요청 오류: {request.error}");
					inputFieldOutput.text = $"오류: {request.error}";
					yield break;
				}

				string jsonResponse = request.downloadHandler.text;

				// JSON 파싱 - Newtonsoft.Json 사용
				try
				{
					JObject json = JObject.Parse(jsonResponse);

					// 비디오 데이터 추출
					JArray items = (JArray)json["items"];
					foreach (JToken item in items)
					{
						JToken snippet = item["snippet"];
						JToken resourceId = snippet["resourceId"];

						// 필드가 없을 경우를 대비해 안전하게 처리
						string channelId = "";
						string channelTitle = "";

						// API 응답 버전에 따라 다른 필드 이름 사용
						if (snippet["videoOwnerChannelId"] != null)
							channelId = snippet["videoOwnerChannelId"].ToString();
						else if (snippet["channelId"] != null)
							channelId = snippet["channelId"].ToString();

						if (snippet["videoOwnerChannelTitle"] != null)
							channelTitle = snippet["videoOwnerChannelTitle"].ToString();
						else if (snippet["channelTitle"] != null)
							channelTitle = snippet["channelTitle"].ToString();

						VideoData video = new()
						{
							videoId = resourceId["videoId"].ToString(),
							title = snippet["title"].ToString(),
							description = snippet["description"].ToString(),
							publishedAt = snippet["publishedAt"].ToString(),
							channelId = channelId,
							channelTitle = channelTitle
						};

						// 썸네일 URL 추출
						if (snippet["thumbnails"] != null && snippet["thumbnails"]["high"] != null)
						{
							video.thumbnailUrl = snippet["thumbnails"]["high"]["url"].ToString();
						}

						allVideoData.Add(video);
					}

					// 다음 페이지 확인
					if (json["nextPageToken"] != null)
					{
						string nextPageToken = json["nextPageToken"].ToString();
						StartCoroutine(GetPlaylistItems(playlistId, apiKey, nextPageToken));
					}
					else
					{
						// 모든 페이지를 로드 완료했으므로 결과 표시
						DisplayResults();
					}
				}
				catch (Exception ex)
				{
					MLog.Log($"JSON 파싱 오류: {ex.Message}");
					MLog.Log($"JSON 파싱 오류: {ex.StackTrace}");
					MLog.Log($"JSON 파싱 오류: {jsonResponse}");

					// JSON 파싱에 실패한 경우 정규식으로 필요한 데이터 추출
					ExtractVideoDataWithRegex(jsonResponse);
					DisplayResults();
				}
			}
		}

		private void ExtractVideoDataWithRegex(string jsonResponse)
		{
			try
			{
				// videoId 정규식
				Regex videoIdRegex = new(@"""videoId""\s*:\s*""([^""]+)""");
				MatchCollection videoIdMatches = videoIdRegex.Matches(jsonResponse);

				// title 정규식
				Regex titleRegex = new(@"""title""\s*:\s*""((?:\\.|[^""\\])*?)""");
				MatchCollection titleMatches = titleRegex.Matches(jsonResponse);

				// channelTitle 정규식
				Regex channelTitleRegex = new(@"""channelTitle""\s*:\s*""((?:\\.|[^""\\])*?)""");
				MatchCollection channelTitleMatches = channelTitleRegex.Matches(jsonResponse);

				int count = Mathf.Min(videoIdMatches.Count, titleMatches.Count, channelTitleMatches.Count);

				for (int i = 0; i < count; i++)
				{
					VideoData video = new()
					{
						videoId = videoIdMatches[i].Groups[1].Value,
						title = UnescapeJsonString(titleMatches[i].Groups[1].Value),
						channelTitle = UnescapeJsonString(channelTitleMatches[i].Groups[1].Value)
					};

					allVideoData.Add(video);
				}

				MLog.Log($"정규식으로 {count}개의 비디오를 추출했습니다.");
			}
			catch (Exception ex)
			{
				MLog.Log($"정규식 추출 오류: {ex.Message}");
			}
		}

		private string UnescapeJsonString(string str)
		{
			return str.Replace("\\\"", "\"").Replace("\\n", "\n").Replace("\\r", "\r").Replace("\\t", "\t");
		}

		private void DisplayResults()
		{
			MLog.Log($"총 {allVideoData.Count}개의 비디오를 찾았습니다.");

			System.Text.StringBuilder sb = new();

			foreach (var video in allVideoData)
			{
				sb.AppendLine($"- [{video.title}](https://youtu.be/{video.videoId})");
			}

			inputFieldOutput.text = sb.ToString();
		}
	}
}