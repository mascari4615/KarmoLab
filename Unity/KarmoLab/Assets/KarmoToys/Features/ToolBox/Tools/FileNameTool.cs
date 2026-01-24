using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;
using KarmoToys.Features.ToolBox;

namespace KarmoToys.Features.ToolBox.Tools
{
	public class FileNameTool : ITool
	{
		public string Name => "File Name Manager";
		private Action<string> _logger;
		private const string TEMP_PATH = "TEMP_PATH";

		public void Initialize(Action<string> logger)
		{
			_logger = logger;
		}

		private void Log(string msg) => _logger?.Invoke(msg);

		public List<ToolAction> GetActions()
		{
			return new List<ToolAction>
			{
				new() {
					Name = "Win Screenshot Fix",
					Description = "Rename 'Screenshot YYYY-MM-DD' to 'YYMMDD_HHMMSS'.",
					MainInputLabel = "Folder Path",
					SubInputLabel = null,
					Execute = (path, sub) => ChangeWinScreenshotName(path)
				},
				new() {
					Name = "VRC Screenshot Fix",
					Description = "Fix VRChat screenshots (Placeholder).",
					MainInputLabel = "Folder Path",
					SubInputLabel = null,
					Execute = (path, sub) => ChangeVRCScreenshotName(path)
				},
				new() {
					Name = "Remove String",
					Description = "Remove specific string from filenames.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "String to Remove",
					Execute = (path, sub) => RemoveSomeString(path, sub)
				},
				new() {
					Name = "File Name To String",
					Description = "Generate Markdown image list.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "URL Path (Optional)",
					Execute = (path, sub) => FileNameToString(path, sub)
				},
				new() {
					Name = "Change Name To Date",
					Description = "Rename files to 'YYMMDD-HHMMSS' based on modify time.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "Prefix Filter",
					Execute = (path, sub) => ChangeNameToDate(path, sub)
				},
				new() {
					Name = "Mod Sub Index",
					Description = "Reindex 'YYMMDD_HHMMSS_XX' files.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "Prefix Filter",
					Execute = (path, sub) => ModSubIndex(path, sub)
				},
				new() {
					Name = "Convert Case",
					Description = "Upper/Lower case conversion.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "'true' for Upper",
					Execute = (path, sub) => ConvertCase(path, sub)
				},
				new() {
					Name = "Convert String",
					Description = "Replace string in filenames.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "From,To",
					Execute = (path, sub) => ConvertString(path, sub)
				},
				new() {
					Name = "Func4 (Remove Prefix)",
					Description = "Remove first 2 chars from '2023...'",
					MainInputLabel = "Folder Path",
					SubInputLabel = null,
					Execute = (path, sub) => Func4(path)
				}
			};
		}

		// --- Utils ---
		private bool IsFileNameExists(string folderPath, string targetName)
		{
			try { return Directory.GetFiles(folderPath, $"{targetName}.*").Length > 0; }
			catch { return false; }
		}

		private string GetNewFileName(string folderPath, string targetName, int subIndex)
		{
			string suffix = subIndex.ToString().PadLeft(2, '0');
			string newFileName = $"{targetName}-{suffix}";
			if (IsFileNameExists(folderPath, newFileName)) return GetNewFileName(folderPath, targetName, subIndex + 1);
			return newFileName;
		}

		private bool FileNameStartsWith(FileInfo fileInfo, List<string> prefixes)
		{
			if ((prefixes == null) || (prefixes.Count == 0)) return true;
			foreach (string prefix in prefixes)
			{
				if (string.IsNullOrEmpty(prefix) || (prefix == TEMP_PATH)) continue;
				if (fileInfo.Name.StartsWith(prefix)) return true;
			}
			return false;
		}

		// --- Impl ---
		private void ChangeWinScreenshotName(string path)
		{
			Log($"WinScreenshotFix Path: {path}");
			if (!Directory.Exists(path)) { Log("Folder not found."); return; }
			string[] prefixes = { "Screenshot 20", "스크린샷 20" };
			DirectoryInfo dir = new DirectoryInfo(path);
			foreach (FileInfo file in dir.GetFiles())
			{
				bool isMatched = prefixes.Any(p => file.Name.StartsWith(p));
				if (!isMatched) continue;
				string fileName = Path.GetFileNameWithoutExtension(file.Name);
				string[] parts = fileName.Split(' ');
				if (parts.Length < 3) continue;
				string date = parts[1].Replace("-", "").Substring(2);
				string time = parts[2];
				string newName = $"{date}_{time}";
				string newFilePath = Path.Combine(path, newName + file.Extension);
				try { file.MoveTo(newFilePath); Log($"Renamed: {fileName} -> {newName}"); }
				catch (IOException)
				{
					string uniqueName = GetNewFileName(path, newName, 1);
					newFilePath = Path.Combine(path, uniqueName + file.Extension);
					file.MoveTo(newFilePath);
					Log($"Renamed(Collision): {fileName} -> {uniqueName}");
				}
				catch (Exception ex) { Log($"Failed: {fileName} ({ex.Message})"); }
			}
		}

		private void ChangeVRCScreenshotName(string path) => Log("VRC Screenshot logic Placeholder.");

		private void RemoveSomeString(string path, string removeString)
		{
			Log($"RemoveString: {path}, {removeString}");
			if (string.IsNullOrEmpty(removeString)) removeString = "-";
			if (!Directory.Exists(path)) { Log("Folder not found."); return; }
			foreach (FileInfo file in new DirectoryInfo(path).GetFiles())
			{
				if (file.Name.Contains(removeString))
				{
					string newName = Path.GetFileNameWithoutExtension(file.Name).Replace(removeString, "");
					string newPath = Path.Combine(path, newName + file.Extension);
					try { file.MoveTo(newPath); Log($"Renamed: {file.Name} -> {newName + file.Extension}"); }
					catch (Exception ex) { Log($"Failed: {ex.Message}"); }
				}
			}
		}

		private void FileNameToString(string path, string somePath)
		{
			if (!Directory.Exists(path)) { Log("Folder not found."); return; }
			if (path.Contains("Mascari4615.github.io\\assets\\project"))
			{
				if (string.IsNullOrEmpty(somePath) || somePath == TEMP_PATH)
				{
					string[] split = path.Split(new[] { "project\\" }, StringSplitOptions.None);
					if (split.Length > 1) somePath = "/assets/project/" + split[1].Replace("\\", "/");
				}
			}
			StringBuilder sb = new();
			foreach (FileInfo file in new DirectoryInfo(path).GetFiles())
			{
				sb.AppendLine($"![{Path.GetFileNameWithoutExtension(file.Name)}]({somePath}/{file.Name})");
			}
			Log(sb.ToString());
		}

		private void ChangeNameToDate(string path, string prefix)
		{
			if (!Directory.Exists(path)) { Log("Folder not found."); return; }
			List<string> prefixes = new List<string>();
			if (!string.IsNullOrEmpty(prefix) && prefix != TEMP_PATH) prefixes.Add(prefix);
			FileInfo[] files = new DirectoryInfo(path).GetFiles();
			Array.Sort(files, (x, y) => string.Compare(x.Name, y.Name, StringComparison.Ordinal));
			if (files.Length == 0) { Log("No files."); return; }
			foreach (FileInfo file in files)
			{
				if (!FileNameStartsWith(file, prefixes)) continue;
				DateTime dateTime = file.CreationTime;
				if (file.LastAccessTime < dateTime) dateTime = file.LastAccessTime;
				if (file.LastWriteTime < dateTime) dateTime = file.LastWriteTime;
				string newFileName = dateTime.ToString("yyMMdd-HHmmss");
				if (IsFileNameExists(path, newFileName)) newFileName = GetNewFileName(path, newFileName, 1);
				string newFilePath = Path.Combine(path, newFileName + file.Extension);
				try { file.MoveTo(newFilePath); Log($"Renamed: {file.Name} -> {newFileName}"); }
				catch (Exception e) { Log($"Failed: {e.Message}"); }
			}
		}

		private void ModSubIndex(string path, string prefix)
		{
			if (!Directory.Exists(path)) return;
			FileInfo[] files = new DirectoryInfo(path).GetFiles();
			bool IsThatSubIndexExists(int subIndex) => files.Any(f => f.Name.Contains($"{prefix}_{subIndex:D2}"));
			int minIndex = 2;
			foreach (FileInfo file in files)
			{
				if (!file.Name.StartsWith(prefix)) continue;
				string[] parts = Path.GetFileNameWithoutExtension(file.Name).Split('_');
				if (parts.Length < 3) continue;
				if (!int.TryParse(parts[2], out int subIndexInt)) continue;
				while (IsThatSubIndexExists(minIndex)) minIndex++;
				if (minIndex == subIndexInt) continue;
				string newFileName = $"{parts[0]}_{parts[1]}_{minIndex:D2}";
				try { file.MoveTo(Path.Combine(path, newFileName + file.Extension)); Log($"Renamed: {file.Name} -> {newFileName}"); }
				catch (Exception ex) { Log(ex.Message); }
			}
		}

		private void ConvertCase(string path, string toUpperString)
		{
			if (!Directory.Exists(path)) return;
			bool toUpper = toUpperString == "true";
			ConvertCaseInDirectory(path, toUpper);
		}

		private void ConvertCaseInDirectory(string path, bool toUpper)
		{
			DirectoryInfo directory = new DirectoryInfo(path);
			foreach (FileInfo file in directory.GetFiles())
			{
				string newName = toUpper ? file.Name.ToUpper() : file.Name.ToLower();
				if (file.Name == newName) continue;
				file.MoveTo(Path.Combine(path, newName));
				Log($"Renamed: {file.Name} -> {newName}");
			}
			foreach (DirectoryInfo subDir in directory.GetDirectories())
			{
				string newSubName = toUpper ? subDir.Name.ToUpper() : subDir.Name.ToLower();
				if (subDir.Name != newSubName)
				{
					string temp = Path.Combine(path, "temp_" + subDir.Name);
					subDir.MoveTo(temp);
					subDir.MoveTo(Path.Combine(path, newSubName));
					Log($"Renamed Dir: {subDir.Name} -> {newSubName}");
				}
				ConvertCaseInDirectory(Path.Combine(path, newSubName), toUpper);
			}
		}

		private void ConvertString(string path, string data)
		{
			if (!Directory.Exists(path)) return;
			string[] split = data.Split(',');
			if (split.Length < 2) { Log("ConvertString: From,To"); return; }
			ConvertStringInDirectory(path, split[0].Trim(), split[1].Trim());
		}

		private void ConvertStringInDirectory(string path, string from, string to)
		{
			DirectoryInfo directory = new DirectoryInfo(path);
			foreach (FileInfo file in directory.GetFiles())
			{
				if (file.Name.Contains(from))
				{
					string newName = file.Name.Replace(from, to);
					file.MoveTo(Path.Combine(path, newName));
					Log($"Renamed: {file.Name} -> {newName}");
				}
			}
			foreach (DirectoryInfo subDir in directory.GetDirectories())
			{
				string currentSubName = subDir.Name;
				if (subDir.Name.Contains(from))
				{
					string newSubName = subDir.Name.Replace(from, to);
					string temp = Path.Combine(path, "temp_" + subDir.Name);
					subDir.MoveTo(temp);
					subDir.MoveTo(Path.Combine(path, newSubName));
					currentSubName = newSubName;
				}
				ConvertStringInDirectory(Path.Combine(path, currentSubName), from, to);
			}
		}

		private void Func4(string path)
		{
			if (!Directory.Exists(path)) { Log("Folder not found."); return; }
			string prefix = "2023";
			foreach (FileInfo file in new DirectoryInfo(path).GetFiles())
			{
				if (file.Name.StartsWith(prefix))
				{
					string newName = file.Name.Substring(2);
					try { file.MoveTo(Path.Combine(path, newName)); Log($"Renamed: {file.Name} -> {newName}"); }
					catch (Exception ex) { Log($"Failed: {file.Name} -> {ex.Message}"); }
				}
			}
		}
	}
}
