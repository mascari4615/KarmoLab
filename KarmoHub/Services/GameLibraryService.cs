using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.IO;
using KarmoHub.Models;

namespace KarmoHub.Services;

public class GameLibraryService
{
	private readonly GithubService _githubService;

	public GameLibraryService()
	{
		_githubService = new GithubService();
	}

	public async Task<IEnumerable<GameItem>> GetGamesAsync()
	{
		var games = new List<GameItem>
		{
			// 기본 로컬 정의
			new GameItem
			{
				Id = "karmo_lab",
				Name = "Karmo Lab",
				Description = "Unity 기반 실험실 프로젝트",
				ExecutablePath = "Games/karmo_lab/KarmoLab.exe", // 실제 설치 경로 및 실행 파일명 수정
				AppType = "Game",
				DefaultVersion = "0.0.0" 
			},
			new GameItem
			{
				Id = "notepad",
				Name = "메모장 (테스트)",
				Description = "윈도우 메모장 실행 테스트",
				ExecutablePath = "notepad.exe",
				AppType = "Tool",
				DefaultVersion = "Windows",
				LatestVersion = "Windows"
			}
		};

		// 온라인 버전 정보 확인 (비동기)
		var latestRelease = await _githubService.GetLatestReleaseAsync();
		if (latestRelease != null)
		{
			var karmoLab = games.FirstOrDefault(g => g.Id == "karmo_lab");
			if (karmoLab != null)
			{
				karmoLab.LatestVersion = latestRelease.TagName;
				// 압축 파일(ZIP) 찾기 (표준 Zip 라이브러리 사용을 위해 .zip만 허용)
				var archiveAsset = latestRelease.Assets.FirstOrDefault(a => a.Name.EndsWith(".zip"));
				
				if (archiveAsset != null)
				{
					karmoLab.DownloadUrl = archiveAsset.DownloadUrl;
				}
				
				karmoLab.Description += $"\n(최신: {latestRelease.TagName})";
			}
		}

		// 로컬 설치 확인
		// LocalAppData/KarmoLab 기준 (사용자별 설치 경로)
		var baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KarmoLab");

		foreach (var game in games)
		{
			// 절대 경로가 아니고, 시스템 경로(메모장)가 아닌 경우 체크
			if (!Path.IsPathRooted(game.ExecutablePath) && game.Id != "notepad")
			{
				// ExecutablePath는 "Games/..." 형태이므로 baseDir와 결합
				var fullPath = Path.Combine(baseDir, game.ExecutablePath);
				
				if (File.Exists(fullPath))
				{
					// 지금은 버전 파일이 없으므로, 파일이 있으면 최신 버전이라고 가정
					// 추후 version.json 등을 통해 관리 필요
					if (game.LatestVersion != "0.0.0")
					{
						game.DefaultVersion = game.LatestVersion;
					}
					else
					{
						game.DefaultVersion = "Installed";
					}
				}
			}
		}

		return games;
	}
}
