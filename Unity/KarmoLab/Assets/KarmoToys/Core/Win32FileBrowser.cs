using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace KarmoToys.Core.Utils
{
	/// <summary>
	/// Win32FileBrowser: 런타임 환경에서 안전하게 파일 선택 다이얼로그를 표시하는 유틸리티.
	/// 
	/// [구현 전략] - 프로세스 격리 (Process Isolation)
	/// 1. 원인: comdlg32.dll 직접 호출은 유니티 엔진의 메모리/스레드 관리와 충돌하여 하드 크래시를 유발함.
	/// 2. 해결: PowerShell 프로세스를 별도로 실행하여 System.Windows.Forms.OpenFileDialog를 호출.
	/// 3. 장점: 탐색기 창이 유니티와 완전히 다른 프로세스에서 동작하므로 엔진 안정성에 영향을 주지 않음.
	/// 4. 통신: StandardOutput을 통해 선택된 파일 경로를 획득하는 비동기 방식 사용.
	/// </summary>
	public static class Win32FileBrowser
	{
		public static void OpenFilePanelAsync(string title, string initialDir, string filters, Action<string> onComplete)
		{
			// Convert Win32 null-separated filters to WinForms pipe-separated
			// Example: "Audio\0*.mp3\0All\0*.*\0\0" -> "Audio|*.mp3|All|*.*"
			string cleanFilters = filters.Replace("\0\0", "").Replace("\0", "|").TrimEnd('|');

			string psScript = $"Add-Type -AssemblyName System.Windows.Forms; " +
			                  $"$f = New-Object System.Windows.Forms.OpenFileDialog; " +
			                  $"$f.Title = '{title}'; " +
			                  $"$f.InitialDirectory = '{initialDir.Replace("'", "''")}'; " +
			                  $"$f.Filter = '{cleanFilters.Replace("'", "''")}'; " +
			                  $"if ($f.ShowDialog() -eq 'OK') {{ $f.FileName }}";

			ProcessStartInfo psi = new ProcessStartInfo
			{
				FileName = "powershell",
				Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{psScript}\"",
				RedirectStandardOutput = true,
				UseShellExecute = false,
				CreateNoWindow = true,
				WindowStyle = ProcessWindowStyle.Hidden
			};

			Process process = new Process { StartInfo = psi, EnableRaisingEvents = true };
			process.Exited += (sender, e) =>
			{
				string result = process.StandardOutput.ReadToEnd().Trim();
				process.Dispose();
				onComplete?.Invoke(string.IsNullOrEmpty(result) ? null : result);
			};

			try
			{
				process.Start();
			}
			catch (Exception ex)
			{
				UnityEngine.Debug.LogError($"[Win32FileBrowser] Failed to start PowerShell: {ex.Message}");
				onComplete?.Invoke(null);
			}
		}
	}
}
