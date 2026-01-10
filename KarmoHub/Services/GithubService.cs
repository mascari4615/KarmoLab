using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace KarmoHub.Services;

public class GithubService
{
	private const string Owner = "mascari4615";
	private const string Repo = "KarmoLab";
	private readonly HttpClient _httpClient;

	public GithubService()
	{
		_httpClient = new HttpClient();
		// GitHub API는 User-Agent 헤더를 요구함
		_httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("KarmoHub");
	}

	public async Task<GithubRelease?> GetLatestReleaseAsync()
	{
		try
		{
			// releases/latest는 정식 릴리스만 반환하므로, Pre-release도 포함하기 위해 전체 목록을 조회하여 첫 번째 항목을 가져옴
			var url = $"https://api.github.com/repos/{Owner}/{Repo}/releases";
			var releases = await _httpClient.GetFromJsonAsync<List<GithubRelease>>(url);
			return releases?.FirstOrDefault();
		}
		catch (Exception)
		{
			// 네트워크 오류 또는 릴리스가 없는 경우 null 반환
			return null;
		}
	}
}

public class GithubRelease
{
	[JsonPropertyName("tag_name")]
	public string TagName { get; set; } = string.Empty;

	[JsonPropertyName("name")]
	public string Name { get; set; } = string.Empty;

	[JsonPropertyName("assets")]
	public List<GithubAsset> Assets { get; set; } = new();
}

public class GithubAsset
{
	[JsonPropertyName("name")]
	public string Name { get; set; } = string.Empty;

	[JsonPropertyName("browser_download_url")]
	public string DownloadUrl { get; set; } = string.Empty;

	[JsonPropertyName("size")]
	public long Size { get; set; }
}
