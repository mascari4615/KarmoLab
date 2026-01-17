using System;
using System.Diagnostics;
using System.IO;
using KarmoToys.Main;
using KarmoToys.Features.ToolBox;
using UnityEngine;

namespace KarmoToys.Features.ToolBox.Tools
{
	public class CompanionLauncherTool : ITool
	{
		public string Name => "Companion Launcher";
		private Action<string> _onOutput;

		public void Initialize(Action<string> onOutput)
		{
			_onOutput = onOutput;
		}

		public System.Collections.Generic.List<ToolAction> GetActions()
		{
			return new System.Collections.Generic.List<ToolAction>
			{
				new ToolAction
				{
					Name = "Summon Companion",
					Description = "Launch the transparent companion window.",
					MainInputLabel = "Args (Optional)",
					SubInputLabel = "",
					Execute = LaunchCompanion
				}
			};
		}

		private void LaunchCompanion(string extraArgs, string unused)
		{
#if UNITY_EDITOR
			string msg = "Cannot launch companion from Editor. Please build and run.";
			KarmoToysApp.Toast.Show(msg, Core.ToastType.Warning);
			_onOutput?.Invoke(msg);
#else
			try
			{
				// Determine executable path
				// Application.dataPath in build is "Path/To/KarmoToys_Data"
				// Executable is "Path/To/KarmoToys.exe"
				string dataPath = Application.dataPath;

				string exePath = "";
#if UNITY_STANDALONE_ODX // One might need specific handling if ODX
				exePath = System.IO.Path.Combine(System.IO.Directory.GetParent(dataPath).FullName, Application.productName + ".exe");
#elif UNITY_STANDALONE_WIN
				// Typical Windows build structure:
				// Root/
				//   KarmoLab.exe
				//   KarmoLab_Data/
				//   MonoBleedingEdge/
				// Application.dataPath points to KarmoLab_Data
				
				// Let's try to deduce it safely
				DirectoryInfo dataDir = new DirectoryInfo(dataPath);
				if (dataDir.Parent != null)
				{
					// Find any .exe that matches product name or just the main exe
					string potentialExe = Path.Combine(dataDir.Parent.FullName, "KarmoLab.exe"); // Hardcoded based on project knowledge
					if (File.Exists(potentialExe)) 
					{
						exePath = potentialExe;
					}
					else
					{
						 // Fallback: try Process.GetCurrentProcess().MainModule.FileName
						 exePath = Process.GetCurrentProcess().MainModule.FileName;
					}
				}
#endif

				if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath))
				{
					throw new FileNotFoundException("Could not locate executable.", exePath);
				}

				ProcessStartInfo startInfo = new ProcessStartInfo();
				startInfo.FileName = exePath;
				string logFileArgs = " -logFile \"" + Path.Combine(Path.GetDirectoryName(exePath), "companion_player.log") + "\"";
				startInfo.Arguments = "-mode companion " + extraArgs + logFileArgs;
				startInfo.UseShellExecute = false; // Changed to false to allow spawning same exe
				startInfo.CreateNoWindow = false; // Ensure window is created
				startInfo.WorkingDirectory = Path.GetDirectoryName(exePath); // Set working directory

				UnityEngine.Debug.Log($"[CompanionLauncher] Starting process:");
				UnityEngine.Debug.Log($"[CompanionLauncher]   FileName: {startInfo.FileName}");
				UnityEngine.Debug.Log($"[CompanionLauncher]   Arguments: {startInfo.Arguments}");
				UnityEngine.Debug.Log($"[CompanionLauncher]   WorkingDirectory: {startInfo.WorkingDirectory}");

				Process.Start(startInfo);
				string successMsg = $"Summoning companion...! ({exePath})";
				KarmoToysApp.Toast.Show("Companion summoned! ?��", Core.ToastType.Info);
				_onOutput?.Invoke(successMsg);
			}
			catch (Exception ex)
			{
				UnityEngine.Debug.LogError($"Failed to launch companion: {ex}");
				_onOutput?.Invoke($"Error: {ex.Message}");
				KarmoToysApp.Toast.Show("Failed to summon companion...", Core.ToastType.Error);
			}
#endif
		}
	}
}
