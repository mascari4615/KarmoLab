using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json.Linq;

namespace KarmoLab.Module.Tools
{
    // Note: Creating a MonoBehaviour dummy runner might be needed if ITool cannot start coroutine directly.
    // However, ToolController is a MonoBehaviour, so we can expose a Coroutine runner.
    
    public class YoutubeTool : ITool
    {
        public string Name => "Youtube Playlist Fetcher";
        private Action<string> _logger;
        private MonoBehaviour _coroutineRunner;

        public void Initialize(Action<string> logger)
        {
            _logger = logger;
            // Find a runner. In a real scenario, ToolController should pass itself as context.
            // For now, we find any MonoBehaviour or rely on ToolController to have a "StartCoroutine" logic via Action?
            // Actually, we can just use `GameObject.FindObjectOfType<ToolController>()` or similar.
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
            // Add others if needed
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
                        foreach(var v in _allVideoData)
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
