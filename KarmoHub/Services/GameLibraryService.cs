using System;
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
				ExecutablePath = "Games/karmo_lab/KarmoLab.exe", 
				AppType = "Game",
				DefaultVersion = "0.0.0",
				RepoOwner = "mascari4615",
				RepoName = "KarmoLab"
			},
			new GameItem
			{
				Id = "witch_mendokusai",
				Name = "Witch Mendokusai",
				Description = "마녀: 귀찮아 (Witch Mendokusai)",
				ExecutablePath = "Games/witch_mendokusai/WitchMendokusai.exe",
				AppType = "Game",
				DefaultVersion = "0.0.0",
				RepoOwner = "mascari4615",
				RepoName = "Witch-Mendokusai"
			}
		};

		// 온라인 버전 정보 확인 (비동기)
		var tasks = games.Where(g => !string.IsNullOrEmpty(g.RepoName)).Select(async game => 
		{
			var release = await _githubService.GetLatestReleaseAsync(game.RepoName, game.RepoOwner);
			if (release != null)
			{
				game.LatestVersion = release.TagName;
				// 압축 파일(ZIP) 찾기 (표준 Zip 라이브러리 사용을 위해 .zip만 허용)
				var archiveAsset = release.Assets.FirstOrDefault(a => a.Name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
					?? release.Assets.FirstOrDefault();
				
				if (archiveAsset != null)
				{
					// GithubAsset 모델에 따라 속성 이름 확인 필요 (DownloadUrl vs BrowserDownloadUrl)
					// 여기서는 기존 코드 기반 DownloadUrl 인듯 하나, GithubService 모델 확인 필요.
					// 일단 기존 코드에 DownloadUrl이 있었으므로 그대로 사용.
					game.DownloadUrl = archiveAsset.DownloadUrl; 
				}
				
				game.Description += $"\n(최신: {release.TagName})";
			}
		});

		await Task.WhenAll(tasks);

		// 로컬 설치 확인
		// LocalAppData/KarmoLab 기준 (사용자별 설치 경로)
		var baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KarmoLab");

		foreach (var game in games)
		{
			// 시스템 경로(절대 경로로 지정된 항목)는 패스
			if (Path.IsPathRooted(game.ExecutablePath)) continue;

			// 1. 지정된 경로에 파일이 있는지 확인
			var expectedPath = Path.Combine(baseDir, game.ExecutablePath);
			if (File.Exists(expectedPath))
			{
				MarkAsInstalled(game);
				continue;
			}

			// 2. 파일이 없다면 설치 폴더(Games/{id}) 내에서 exe 탐색 (폴더 구조 변경 등 대응)
			// 예상 설치 폴더: AppData/.../Games/{game.Id}
			var installFolder = Path.Combine(baseDir, "Games", game.Id);
			if (Directory.Exists(installFolder))
			{
				try
				{
					// UnityCrashHandler 등 제외하고 가장 유력한 exe 찾기
					var foundExe = Directory.EnumerateFiles(installFolder, "*.exe", SearchOption.AllDirectories)
						.FirstOrDefault(f => 
						{
							var name = Path.GetFileName(f);
							return !name.Contains("UnityCrashHandler") 
								&& !name.Contains("createdump");
						});

					if (foundExe != null)
					{
						// 찾은 경로로 업데이트 (상대 경로 변환)
						game.ExecutablePath = Path.GetRelativePath(baseDir, foundExe);
						MarkAsInstalled(game);
					}
				}
				catch { /* 탐색 실패 무시 */ }
			}
		}

		return games;
	}

	private void MarkAsInstalled(GameItem game)
	{
		// 버전 정보가 있으면 업데이트, 없으면 "Installed" 처리
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
