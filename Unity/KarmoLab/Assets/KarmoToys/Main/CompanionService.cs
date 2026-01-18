using System;
using System.Diagnostics;
using System.IO;
using UnityEngine;
using KarmoToys.Common;
using KarmoToys.Core;

namespace KarmoToys.Main
{
	/// <summary>
	/// 컴패니언 프로세스 실행 및 시스템 서비스를 제공
	/// </summary>
	public static class CompanionService
	{
#pragma warning disable CS0162 // Unreachable code detected
		public static void Launch(string extraArgs = "")
		{
#if UNITY_EDITOR
			KarmoToysApp.Toast.Show("에디터에서는 컴패니언을 실행할 수 없음! 빌드 후 확인이 필요함.", ToastType.Warning);
			return;
#endif
			try
			{
				string dataPath = Application.dataPath;
				string exePath = "";
				DirectoryInfo dataDir = new DirectoryInfo(dataPath);

				if (dataDir.Parent != null)
				{
					string potentialExe = Path.Combine(dataDir.Parent.FullName, "KarmoLab.exe");
					if (File.Exists(potentialExe)) exePath = potentialExe;
					else exePath = Process.GetCurrentProcess().MainModule.FileName;
				}

				if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath))
				{
					KarmoToysApp.Toast.Show("실행 파일을 찾을 수 없음!", ToastType.Error);
					return;
				}

				ProcessStartInfo startInfo = new ProcessStartInfo
				{
					FileName = exePath,
					Arguments = $"-mode {AppMode.Companion.ToString().ToLower()} {extraArgs} -logFile \"{Path.Combine(Path.GetDirectoryName(exePath), "companion_player.log")}\"",
					UseShellExecute = false,
					CreateNoWindow = false,
					WorkingDirectory = Path.GetDirectoryName(exePath)
				};

				Process.Start(startInfo);
				KarmoToysApp.Toast.Show("컴패니언 소환 중...! 👤✨", ToastType.Info);
			}
			catch (Exception ex)
			{
				UnityEngine.Debug.LogError($"[CompanionService] Failed to launch companion: {ex}");
				KarmoToysApp.Toast.Show("컴패니언 소환 실패... 😿", ToastType.Error);
			}
		}
#pragma warning restore CS0162
	}
}
