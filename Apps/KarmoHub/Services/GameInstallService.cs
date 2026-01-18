using System;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Threading.Tasks;
using KarmoHub.Models;
using Microsoft.Win32;

namespace KarmoHub.Services;

public class GameInstallService
{
	private readonly HttpClient _httpClient;
	// AppData/Local/KarmoLab 경로 사용
	private readonly string _baseAppDataPath;

	public GameInstallService()
	{
		_httpClient = new HttpClient();
		_httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("KarmoHub");
		
		_baseAppDataPath = Path.Combine(
			Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
			"KarmoLab"
		);
	}

	public async Task InstallGameAsync(GameItem game, IProgress<int>? progress = null)
	{
		if (string.IsNullOrEmpty(game.DownloadUrl))
		{
			 throw new InvalidOperationException("다운로드 URL이 없습니다.");
		}

		// 설치 경로: %LocalAppData%/KarmoLab/Games/{GameId}
		// GameItem.ExecutablePath가 "Games/..." 로 시작하므로 이를 고려해서 경로 조합
		// 여기서는 {GameId} 폴더까지만 지정 (ZIP 내부에 구조가 있다고 가정하거나 루트에 품)
		
		// NOTE: 현재 ZIP 파일 구조가 "KarmoLab.exe"가 최상위에 있거나, "Built/..." 일 수 있음.
		// 기존 로직: BaseInstallPath/"Games"/{GameId} 
		// 새 로직: _baseAppDataPath/"Games"/{GameId}
		
		var installPath = Path.Combine(_baseAppDataPath, "Games", game.Id);
		var tempZipPath = Path.Combine(Path.GetTempPath(), $"{game.Id}_{Guid.NewGuid()}.zip");

		try
		{
			// 1. 디렉토리 정리 (기존 버전 삭제)
			if (Directory.Exists(installPath))
			{
				Directory.Delete(installPath, true);
			}
			Directory.CreateDirectory(installPath);

			// 2. 다운로드
			using (var response = await _httpClient.GetAsync(game.DownloadUrl, HttpCompletionOption.ResponseHeadersRead))
			{
				response.EnsureSuccessStatusCode();
				var totalBytes = response.Content.Headers.ContentLength ?? -1L;
				
				using (var contentStream = await response.Content.ReadAsStreamAsync())
				using (var fileStream = new FileStream(tempZipPath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true))
				{
					 var buffer = new byte[8192];
					 var totalRead = 0L;
					 var isMoreToRead = true;
					 var lastProgress = 0;

					 do
					 {
						 var read = await contentStream.ReadAsync(buffer, 0, buffer.Length);
						 if (read == 0)
						 {
							 isMoreToRead = false;
						 }
						 else
						 {
							 await fileStream.WriteAsync(buffer, 0, read);

							 totalRead += read;
							 if (totalBytes != -1)
							 {
								 var currentProgress = (int)((double)totalRead / totalBytes * 100);
								 if (currentProgress > lastProgress)
								 {
									 lastProgress = currentProgress;
									 progress?.Report(currentProgress);
								 }
							 }
						 }
					 } while (isMoreToRead);
				}
			}

			// 3. 압축 해제 (System.IO.Compression 사용 - ZIP 전용, 최적화)
			progress?.Report(100);
			await Task.Delay(100); // UI 업데이트 대기

			await Task.Run(() => 
			{
				// ZipFile.ExtractToDirectory는 내부적으로 최적화되어 있어 별도 스트리밍 구현 불필요
				ZipFile.ExtractToDirectory(tempZipPath, installPath, true);
			});

			// 4. 버전 업데이트 반영
			game.DefaultVersion = (game.LatestVersion == "0.0.0") ? "Installed" : game.LatestVersion;
			
			// 5. Windows 레지스트리 등록 (제어판 - 프로그램 추가/제거에 표시)
			RegisterToWindowsSettings(game, installPath);

			// 6. 시작 메뉴 바로가기 생성 (Windows 검색 노출)
			CreateStartMenuShortcut(game, installPath);
		}
		finally
		{
			if (File.Exists(tempZipPath))
			{
				try { File.Delete(tempZipPath); } catch { /* 무시 */ }
			}
		}
	}

	public async Task UninstallGameAsync(GameItem game)
	{
		// 1. 레지스트리 제거
		try
		{
			string keyPath = $@"Software\Microsoft\Windows\CurrentVersion\Uninstall\KarmoLab_{game.Id}";
			using (var key = Registry.CurrentUser.OpenSubKey(keyPath, true))
			{
				if (key != null)
				{
					// 레지스트리에서 이름 가져오기 (바로가기 삭제용)
					var gameName = key.GetValue("DisplayName") as string ?? game.Name;
					
					Registry.CurrentUser.DeleteSubKeyTree(keyPath, false);

					// 2. 시작 메뉴 바로가기 삭제
					var startMenuPath = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
					var lnkPath = Path.Combine(startMenuPath, "KarmoLab", $"{gameName}.lnk");
					if (File.Exists(lnkPath))
					{
						File.Delete(lnkPath);
					}
				}
			}
		}
		catch { /* 무시 */ }

		// 3. 파일 삭제
		var installPath = Path.Combine(_baseAppDataPath, "Games", game.Id);
		if (Directory.Exists(installPath))
		{
			await Task.Run(() => 
			{
				try { Directory.Delete(installPath, true); } catch { /* 무시 */ }
			});
		}

		// 4. 상태 초기화
		game.DefaultVersion = "0.0.0";
	}

	private void CreateStartMenuShortcut(GameItem game, string installLocation)
	{
		try
		{
			// 시작 메뉴 경로: %AppData%\Microsoft\Windows\Start Menu\Programs\KarmoLab
			var startMenuPath = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
			var karmoMenuPath = Path.Combine(startMenuPath, "KarmoLab");

			if (!Directory.Exists(karmoMenuPath))
			{
				Directory.CreateDirectory(karmoMenuPath);
			}

			var shortcutPath = Path.Combine(karmoMenuPath, $"{game.Name}.lnk");
			var targetPath = Path.Combine(_baseAppDataPath, game.ExecutablePath);

			// PowerShell을 사용하여 바로가기 생성 (COM 참조 불필요)
			// $s = ...CreateShortcut...
			// $s.TargetPath = ...
			// $s.Save()
			var script = $@"
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('{shortcutPath}')
$s.TargetPath = '{targetPath}'
$s.Description = 'KarmoLab Game Information'
$s.Save()";

			var processInfo = new System.Diagnostics.ProcessStartInfo
			{
				FileName = "powershell.exe",
				Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{script}\"",
				UseShellExecute = false,
				CreateNoWindow = true
			};

			using (var process = System.Diagnostics.Process.Start(processInfo))
			{
				process?.WaitForExit();
			}
		}
		catch (Exception)
		{
			// 바로가기 생성 실패 무시
		}
	}

	private void RegisterToWindowsSettings(GameItem game, string installLocation)
	{
		try
		{
			// HKCU (현재 사용자) 레지스트리에 등록 -> 관리자 권한 필요 없음
			string keyPath = $@"Software\Microsoft\Windows\CurrentVersion\Uninstall\KarmoLab_{game.Id}";
			
			using (var key = Registry.CurrentUser.CreateSubKey(keyPath))
			{
				if (key != null)
				{
					key.SetValue("DisplayName", game.Name);
					key.SetValue("DisplayVersion", game.LatestVersion);
					key.SetValue("Publisher", "KarmoLab");
					key.SetValue("InstallLocation", installLocation);
					key.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
					key.SetValue("NoModify", 1);
					key.SetValue("NoRepair", 1);
					
					// 아이콘 설정 (실행 파일이 있다고 가정)
					// ExecutablePath는 "Games/..." 상대 경로이므로 이름만 추출하거나 조합 필요
					// 여기서는 installLocation 내의 exe 탐색 시도
					var exeName = Path.GetFileName(game.ExecutablePath);
					var exePath = Path.Combine(installLocation, exeName);
					if (File.Exists(exePath))
					{
						key.SetValue("DisplayIcon", exePath);
					}

					// UninstallString 없으면 제어판(프로그램 및 기능)에 안 뜨는 경우가 많음
					// KarmoHub에게 언인스톨 위임
					var launcherPath = Environment.ProcessPath;
					if (!string.IsNullOrEmpty(launcherPath))
					{
						key.SetValue("UninstallString", $"\"{launcherPath}\" --uninstall \"{game.Id}\"");
					}
				}
			}
		}
		catch (Exception)
		{
			// 레지스트리 등록 실패는 설치 실패로 간주하지 않음 (조용히 무시)
		}
	}
}
