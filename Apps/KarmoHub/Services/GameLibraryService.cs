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
				Id = "karmo_vscode_extension",
				Name = "Karmo VSCode Extension",
				Description = "KarmoLab 통합 개발 도구 확장",
				ExecutablePath = "Apps/karmo-vscode-extension", 
				AppType = "Extension",
				Category = AppCategory.Package,
				DefaultVersion = "0.0.0",
				RepoOwner = "mascari4615",
				RepoName = "KarmoLab"
			},
			new GameItem
			{
				Id = "karmo_toys",
				Name = "KarmoToys",
				Description = "KarmoLab 내부 핵심 기능 모듈 시스템",
				ExecutablePath = "Games/karmo_toys/KarmoToys.exe",
				AppType = "Module",
				Category = AppCategory.Game,
				DefaultVersion = "v2026.1.0",
				LatestVersion = "v2026.1.0",
				RepoOwner = "mascari4615",
				RepoName = "KarmoToys"
			},
			new GameItem
			{
				Id = "witch_mendokusai",
				Name = "Witch Mendokusai",
				Description = "마녀: 귀찮아 (Witch Mendokusai)",
				ExecutablePath = "Games/witch_mendokusai/WitchMendokusai.exe",
				AppType = "Game",
				Category = AppCategory.Game,
				DefaultVersion = "0.0.0",
				RepoOwner = "mascari4615",
				RepoName = "Witch-Mendokusai"
			},
			new GameItem
			{
				Id = "karmo_editor",
				Name = "KarmoEditor",
				Description = "Unity Editor utilities and custom toolbar",
				ExecutablePath = "../../Unity/LocalPackages/com.mascari4615.karmo-editor", 
				AppType = "Package",
				Category = AppCategory.Package,
				DefaultVersion = "0.0.0",
				RepoOwner = "mascari4615",
				RepoName = "KarmoEditor"
			}
		};

		// ONLINE 버전 정보 확인 (비동기) - ToList()를 호출하여 즉시 실행 보장
		var tasksList = games.Where(g => !string.IsNullOrEmpty(g.RepoName)).Select(async game => 
		{
			try
			{
				var release = await _githubService.GetLatestReleaseAsync(game.RepoName, game.RepoOwner);
				if (release != null)
				{
					game.LatestVersion = release.TagName;
					// 압축 파일(ZIP) 찾기
					var archiveAsset = release.Assets.FirstOrDefault(a => a.Name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
						?? release.Assets.FirstOrDefault();
					
					if (archiveAsset != null)
					{
						game.DownloadUrl = archiveAsset.DownloadUrl; 
					}
					
					// Description 업데이트는 한 번만 수행하도록 체크 (목록 재생성 시 초기화되므로 중복 누적 안됨)
					if (!game.Description.Contains("(최신:"))
					{
						game.Description += $"\n(최신: {release.TagName})";
					}
				}
			}
			catch (Exception ex)
			{
				System.Diagnostics.Trace.WriteLine($"Github fetch failed for {game.Name}: {ex.Message}");
			}
		}).ToList();

		await Task.WhenAll(tasksList);

		// 로컬 설치 및 버전 확인
		var baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KarmoLab");
		// 프로젝트 루트 경로 (KarmoHub.exe 실행 위치 기준 상향)
		var projectRoot = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", ".."));

		foreach (var game in games)
		{
			if (game.Category == AppCategory.Package)
			{
				// 로컬 패키지/확장 버전 감지 (ExecutablePath 기반)
				var packageJsonPath = Path.Combine(projectRoot, game.ExecutablePath, "package.json");
				game.DefaultVersion = DetectLocalPackageVersion(packageJsonPath);
				continue;
			}

			// 시스템 경로(절대 경로로 지정된 항목)는 패스
			if (Path.IsPathRooted(game.ExecutablePath)) continue;

			// 1. 지정된 경로에 파일이 있는지 확인
			var expectedPath = Path.Combine(baseDir, game.ExecutablePath);
			if (File.Exists(expectedPath))
			{
				MarkAsInstalled(game);
				continue;
			}

			// 2. 파일이 없다면 설치 폴더(Games/{id}) 내에서 exe 탐색
			var installFolder = Path.Combine(baseDir, "Games", game.Id);
			if (Directory.Exists(installFolder))
			{
				try
				{
					var files = Directory.GetFiles(installFolder, "*.exe", SearchOption.AllDirectories);
					var foundExe = files.FirstOrDefault(f => 
						{
							var name = Path.GetFileName(f);
							return !name.Contains("UnityCrashHandler") 
								&& !name.Contains("createdump");
						});

					if (foundExe != null)
					{
						game.ExecutablePath = Path.GetRelativePath(baseDir, foundExe);
						MarkAsInstalled(game);
					}
					else if (files.Any())
					{
						// exe는 없지만 파일이 있다면 일단 설치된 것으로 간주 (폴더 열기 등 가능하게)
						MarkAsInstalled(game);
					}
				}
				catch { /* 탐색 실패 무시 */ }
			}
		}

		return games;
	}

	private string DetectLocalPackageVersion(string packageJsonPath)
	{
		try
		{
			if (File.Exists(packageJsonPath))
			{
				var content = File.ReadAllText(packageJsonPath);
				// 정규식이나 JSON 파싱으로 버전 추출 (단순화를 위해 "version": "..." 매칭)
				var match = System.Text.RegularExpressions.Regex.Match(content, "\"version\"\\s*:\\s*\"([^\"]+)\"");
				if (match.Success)
				{
					return match.Groups[1].Value;
				}
			}
		}
		catch { /* 무시 */ }
		return "0.0.0";
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
