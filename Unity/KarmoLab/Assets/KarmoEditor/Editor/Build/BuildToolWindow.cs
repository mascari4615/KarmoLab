using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace KarmoTools.Build
{
	public class BuildToolWindow : EditorWindow
	{
		[MenuItem("KarmoTools/Build Helper")]
		public static void ShowWindow()
		{
			GetWindow<BuildToolWindow>("Build Helper");
		}

		// Config Keys
		private const string KEY_OUTPUT_PATH = "KarmoTools_BuildPath";
		private const string KEY_LIVE_PATH = "KarmoTools_LivePath";
		private const string KEY_PREFIX = "KarmoTools_Prefix";

		// Fields
		private string _outputPath;
		private string _livePath;
		private string _filePrefix = "KarmoLab";
		private string _buildMemo = "";
		private bool _openFolderAfterBuild = true;
		private bool _deleteDoNotShip = true;

		private void OnEnable()
		{
			_outputPath = EditorPrefs.GetString(KEY_OUTPUT_PATH, "");
			_livePath = EditorPrefs.GetString(KEY_LIVE_PATH, "");
			_filePrefix = EditorPrefs.GetString(KEY_PREFIX, "KarmoLab");
		}

		private void OnDisable()
		{
			EditorPrefs.SetString(KEY_OUTPUT_PATH, _outputPath);
			EditorPrefs.SetString(KEY_LIVE_PATH, _livePath);
			EditorPrefs.SetString(KEY_PREFIX, _filePrefix);
		}

		private void OnGUI()
		{
			GUILayout.Label("Build Configuration", EditorStyles.boldLabel);

			// 1. Output Path
			EditorGUILayout.BeginHorizontal();
			_outputPath = EditorGUILayout.TextField("Build Output Path", _outputPath);
			if (GUILayout.Button("...", GUILayout.Width(30)))
			{
				string path = EditorUtility.OpenFolderPanel("Select Build Output Folder", _outputPath, "");
				if (!string.IsNullOrEmpty(path)) _outputPath = path;
			}
			EditorGUILayout.EndHorizontal();

			// 2. Live (Deploy) Path
			EditorGUILayout.BeginHorizontal();
			_livePath = EditorGUILayout.TextField("Live Deploy Path", _livePath);
			if (GUILayout.Button("...", GUILayout.Width(30)))
			{
				string path = EditorUtility.OpenFolderPanel("Select Live Deploy Folder", _livePath, "");
				if (!string.IsNullOrEmpty(path)) _livePath = path;
			}
			EditorGUILayout.EndHorizontal();

			EditorGUILayout.Space();
			GUILayout.Label("Build Settings", EditorStyles.boldLabel);

			_filePrefix = EditorGUILayout.TextField("File Prefix", _filePrefix);
			_buildMemo = EditorGUILayout.TextField("Memo (Optional)", _buildMemo);
			_openFolderAfterBuild = EditorGUILayout.Toggle("Open Folder After Build", _openFolderAfterBuild);
			_deleteDoNotShip = EditorGUILayout.Toggle("Delete DoNotShip Folders", _deleteDoNotShip);

			EditorGUILayout.Space();
			EditorGUILayout.HelpBox($"Preview: {_outputPath}/{GetFolderName()}/{_filePrefix}.exe", MessageType.Info);

			EditorGUILayout.Space();

			if (GUILayout.Button("Build Only", GUILayout.Height(30)))
			{
				BuildApp(false);
			}

			GUI.backgroundColor = Color.green;
			if (GUILayout.Button("Build & Deploy (Patch)", GUILayout.Height(40)))
			{
				if (EditorUtility.DisplayDialog("Deploy Warning",
					"This will overwrite files in the Live Deploy Path.\nEnsure the application is closed.\nProceed?", "Yes, Patch it!", "Cancel"))
				{
					BuildApp(true);
				}
			}
			GUI.backgroundColor = Color.white;
		}

		private string GetFolderName()
		{
			string dateStr = DateTime.Now.ToString("yyyy-MM-dd_HH-mm");
			string memoPart = string.IsNullOrWhiteSpace(_buildMemo) ? "" : $"_{_buildMemo}";
			return $"{_filePrefix}_{dateStr}{memoPart}";
		}

		private void BuildApp(bool deploy)
		{
			if (string.IsNullOrEmpty(_outputPath))
			{
				EditorUtility.DisplayDialog("Error", "Please select a Build Output Path.", "OK");
				return;
			}

			string folderName = GetFolderName();
			string fullPath = Path.Combine(_outputPath, folderName);
			string exePath = Path.Combine(fullPath, _filePrefix + ".exe");

			// Ensure Directory
			if (!Directory.Exists(fullPath)) Directory.CreateDirectory(fullPath);

			// Build Player Options
			BuildPlayerOptions buildPlayerOptions = new BuildPlayerOptions();
			buildPlayerOptions.scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
			buildPlayerOptions.locationPathName = exePath;
			buildPlayerOptions.target = BuildTarget.StandaloneWindows64;
			buildPlayerOptions.options = BuildOptions.None;

			// Perform Build
			UnityEditor.Build.Reporting.BuildReport report = BuildPipeline.BuildPlayer(buildPlayerOptions);
			UnityEditor.Build.Reporting.BuildSummary summary = report.summary;

			if (summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded)
			{
				Debug.Log($"[KarmoTools] Build Succeeded: {summary.totalSize / 1024 / 1024} MB");

				if (_deleteDoNotShip)
				{
					// Delete DoNotShip Folder
					string doNotShipPath = Path.Combine(fullPath, $"{PlayerSettings.productName}_BurstDebugInformation_DoNotShip");
					if (Directory.Exists(doNotShipPath))
					{
						Directory.Delete(doNotShipPath, true);
						Debug.Log($"[KarmoTools] Deleted: {doNotShipPath}");
					}

					// Delete BackUpThisFolder_ButDontShipItWithYourGame
					string backupPath = Path.Combine(fullPath, $"{PlayerSettings.productName}_BackUpThisFolder_ButDontShipItWithYourGame");
					if (Directory.Exists(backupPath))
					{
						Directory.Delete(backupPath, true);
						Debug.Log($"[KarmoTools] Deleted: {backupPath}");
					}
				}

				if (deploy)
				{
					DeployToLive(fullPath);
				}
				else if (_openFolderAfterBuild)
				{
					EditorUtility.RevealInFinder(exePath);
				}
			}
			else
			{
				Debug.LogError($"[KarmoTools] Build Failed: {summary.result}");
			}
		}

		private void DeployToLive(string sourceDir)
		{
			if (string.IsNullOrEmpty(_livePath))
			{
				EditorUtility.DisplayDialog("Error", "Please select a Live Deploy Path.", "OK");
				return;
			}

			if (!Directory.Exists(_livePath))
			{
				Directory.CreateDirectory(_livePath);
			}

			try
			{
				CopyDirectory(sourceDir, _livePath);
				Debug.Log($"[KarmoTools] Deployed successfully to: {_livePath}");
				EditorUtility.DisplayDialog("Success", "Build & Deploy Complete!\nFiles updated in Live Path.", "Awesome!");

				if (_openFolderAfterBuild)
				{
					EditorUtility.RevealInFinder(Path.Combine(_livePath, _filePrefix + ".exe"));
				}
			}
			catch (Exception ex)
			{
				Debug.LogError($"[KarmoTools] Deploy Failed: {ex.Message}");
				EditorUtility.DisplayDialog("Error", $"Deploy Failed.\n{ex.Message}", "OK");
			}
		}

		private void CopyDirectory(string sourceDir, string destDir)
		{
			DirectoryInfo dir = new DirectoryInfo(sourceDir);
			DirectoryInfo[] dirs = dir.GetDirectories();

			foreach (FileInfo file in dir.GetFiles())
			{
				string tempPath = Path.Combine(destDir, file.Name);
				file.CopyTo(tempPath, true);
			}

			foreach (DirectoryInfo subdir in dirs)
			{
				string tempPath = Path.Combine(destDir, subdir.Name);
				if (!Directory.Exists(tempPath)) Directory.CreateDirectory(tempPath);
				CopyDirectory(subdir.FullName, tempPath);
			}
		}
	}
}
