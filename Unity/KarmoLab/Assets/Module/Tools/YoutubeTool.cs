using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json.Linq;

namespace KarmoLab.Module.Tools
{
	// 참고: ITool이 코루틴을 직접 시작할 수 없는 경우 MonoBehaviour 더미 러너 생성이 필요할 수 있음.
	// 하지만 ToolController가 MonoBehaviour이므로 코루틴 러너를 노출할 수 있음.

	public class YoutubeTool : ITool
	{
		public string Name => "Youtube Playlist Fetcher";
		private Action<string> _logger;
		private MonoBehaviour _coroutineRunner;

		public void Initialize(Action<string> logger)
		{
			_logger = logger;
			// 러너 찾기. 실제 시나리오에서는 ToolController가 자신을 컨텍스트로 전달해야 함.
			// 현재로서는 임의의 MonoBehaviour를 찾거나 ToolController가 Action을 통해 "StartCoroutine" 로직을 갖도록 의존함?
			// 사실 그냥 `GameObject.FindObjectOfType<ToolController>()` 등을 사용할 수 있음.
			_coroutineRunner = UnityEngine.Object.FindAnyObjectByType<MonoBehaviour>();
		}

		public List<ToolAction> GetActions()
		{
			return new List<ToolAction>
			{
				new ToolAction {
					Name = "Fetch Playlist",
					Description = "Youtube Playlist에 포함된 모든 동영상의 정보를 가져옵니다.",
					MainInputLabel = "Playlist ID",
					SubInputLabel = "API Key",
					Execute = (playlistId, apiKey) => FetchPlaylist(playlistId, apiKey)
				}
			};
		}

		private void Log(string msg) => _logger?.Invoke(msg);

		private class VideoData
		{
			public string title;
			public string channelTitle;
			public string publishedAt;
			// 필요한 경우 추가 항목
			public override string ToString() => $"[{publishedAt}] {channelTitle}: {title}";
		}

		private List<VideoData> _allVideoData = new List<VideoData>();

		private void FetchPlaylist(string playlistId, string apiKey)
		{
			if (string.IsNullOrEmpty(playlistId) || string.IsNullOrEmpty(apiKey))
			{
				Log("Playlist ID and API Key are required.");
				return;
			}

			_allVideoData.Clear();
			if (_coroutineRunner != null)
				_coroutineRunner.StartCoroutine(GetPlaylistItems(playlistId, apiKey));
			else
				Log("Error: No Coroutine Runner found.");
		}

		private IEnumerator GetPlaylistItems(string playlistId, string apiKey, string pageToken = null)
		{
			string url = $"https://www.googleapis.com/youtube/v3/playlistItems" +
						 $"?part=snippet" +
						 $"&maxResults=50" +
						 $"&playlistId={playlistId}" +
						 $"&key={apiKey}";

			if (!string.IsNullOrEmpty(pageToken))
				url += $"&pageToken={pageToken}";

			using (UnityWebRequest request = UnityWebRequest.Get(url))
			{
				request.SetRequestHeader("Content-Type", "application/json");
				yield return request.SendWebRequest();

				if (request.result != UnityWebRequest.Result.Success)
				{
					Log($"API Error: {request.error}");
					yield break;
				}

				try
				{
					JObject json = JObject.Parse(request.downloadHandler.text);
					JArray items = (JArray)json["items"];

					if (items != null)
					{
						foreach (JToken item in items)
						{
							var snippet = item["snippet"];
							if (snippet == null) continue;

							string cTitle = snippet["videoOwnerChannelTitle"]?.ToString() ?? snippet["channelTitle"]?.ToString() ?? "Unknown";

							_allVideoData.Add(new VideoData
							{
								title = snippet["title"]?.ToString(),
								publishedAt = snippet["publishedAt"]?.ToString(),
								channelTitle = cTitle
							});
						}
					}

					string nextPage = json["nextPageToken"]?.ToString();
					if (!string.IsNullOrEmpty(nextPage))
					{
						Log($"Fetching next page ({_allVideoData.Count} items so far)...");
						_coroutineRunner.StartCoroutine(GetPlaylistItems(playlistId, apiKey, nextPage));
					}
					else
					{
						Log($"Done! Found {_allVideoData.Count} videos.");
						// Dump result
						foreach (var v in _allVideoData)
						{
							Log(v.ToString());
						}
					}
				}
				catch (Exception ex)
				{
					Log($"JSON Parse Error: {ex.Message}");
				}
			}
		}
	}
}
