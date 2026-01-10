using System;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Threading.Tasks;
using KarmoHub.Models;

namespace KarmoHub.Services;

public class GameInstallService
{
	private readonly HttpClient _httpClient;
	private const string BaseInstallPath = "Games";

	public GameInstallService()
	{
		_httpClient = new HttpClient();
		_httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("KarmoHub");
	}

	public async Task InstallGameAsync(GameItem game, IProgress<int>? progress = null)
	{
		if (string.IsNullOrEmpty(game.DownloadUrl))
		{
			 throw new InvalidOperationException("다운로드 URL이 없습니다.");
		}

		// 설치 경로: 실행 파일 위치(KarmoHub.exe) / Games / {GameId}
		var installPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, BaseInstallPath, game.Id);
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
			game.DefaultVersion = game.LatestVersion;
		}
		finally
		{
			if (File.Exists(tempZipPath))
			{
				try { File.Delete(tempZipPath); } catch { /* 무시 */ }
			}
		}
	}
}
