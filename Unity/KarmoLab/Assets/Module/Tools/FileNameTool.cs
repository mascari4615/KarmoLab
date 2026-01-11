using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;

namespace KarmoLab.Module.Tools
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
				new ToolAction {
					Name = "Win Screenshot Fix",
					Description = "Windows 기본 캡처 도구의 스크린샷 이름(Screenshot YYYY-MM-DD...)을 'YYMMDD_HHMMSS' 포맷으로 변경합니다.",
					MainInputLabel = "Folder Path",
					SubInputLabel = null,
					Execute = (path, sub) => ChangeWinScreenshotName(path)
				},
				new ToolAction {
					Name = "VRC Screenshot Fix",
					Description = "VRChat 스크린샷 파일 이름을 정규화합니다. (현재 미구현 Placeholder)",
					MainInputLabel = "Folder Path",
					SubInputLabel = null,
					Execute = (path, sub) => ChangeVRCScreenshotName(path)
				},
				new ToolAction {
					Name = "Remove String",
					Description = "폴더 내 모든 파일 이름에서 특정 문자열을 제거합니다.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "String to Remove",
					Execute = (path, sub) => RemoveSomeString(path, sub)
				},
				new ToolAction {
					Name = "File Name To String",
					Description = "폴더 내 파일 목록을 마크다운 포맷(Markdown Image syntax) 텍스트로 변환하여 출력합니다.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "URL Path (Optional)",
					Execute = (path, sub) => FileNameToString(path, sub)
				},
				new ToolAction {
					Name = "Change Name To Date",
					Description = "파일의 생성/수정 시간을 기준으로 이름을 'YYMMDD-HHMMSS' 포맷으로 변경합니다. Prefix가 지정되면 해당 접두어가 붙은 파일만 처리합니다.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "Prefix (Filter)",
					Execute = (path, sub) => ChangeNameToDate(path, sub)
				},
				new ToolAction {
					Name = "Mod Sub Index",
					Description = "파일명의 중복 숫자 인덱스(YYMMDD_HHMMSS_'XX')를 순차적으로 재정렬합니다.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "Prefix (Filter)",
					Execute = (path, sub) => ModSubIndex(path, sub)
				},
				new ToolAction {
					Name = "Convert Case",
					Description = "폴더 내 모든 파일/폴더의 이름을 대문자 혹은 소문자로 일괄 변경합니다.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "'true' for Upper, empty for Lower",
					Execute = (path, sub) => ConvertCase(path, sub)
				},
				new ToolAction {
					Name = "Convert String",
					Description = "폴더 내 파일 이름에서 특정 문자열을 다른 문자열로 치환합니다.",
					MainInputLabel = "Folder Path",
					SubInputLabel = "From,To (Comma Separated)",
					Execute = (path, sub) => ConvertString(path, sub)
				},
				new ToolAction {
					Name = "Func4 (Remove Prefix)",
					Description = "2023 등으로 시작하는 파일명에서 앞 2자리를 제거합니다.",
					MainInputLabel = "Folder Path",
					SubInputLabel = null,
					Execute = (path, sub) => Func4(path)
				}
			};
		}

		// --- 유틸 ---
		private bool IsFileNameExists(string folderPath, string targetName)
		{
			try
			{
				return Directory.GetFiles(folderPath, $"{targetName}.*").Length > 0;
			}
			catch { return false; }
		}

		private string GetNewFileName(string folderPath, string targetName, int subIndex)
		{
			string suffix = subIndex.ToString().PadLeft(2, '0');
			string newFileName = $"{targetName}-{suffix}";

			if (IsFileNameExists(folderPath, newFileName))
				return GetNewFileName(folderPath, targetName, subIndex + 1);
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

		// --- 구현부 ---
		private void ChangeWinScreenshotName(string path)
		{
			Log($"{nameof(ChangeWinScreenshotName)} called. Path: {path}");
			if (!Directory.Exists(path))
			{
				Log("Folder path does not exist.");
				return;
			}

			string[] prefixes = { "Screenshot 20", "스크린샷 20" };
			var dir = new DirectoryInfo(path);
			var files = dir.GetFiles();

			foreach (var file in files)
			{
				bool isMatched = prefixes.Any(p => file.Name.StartsWith(p));
				if (!isMatched) continue;

				// 예시: Screenshot 2024-05-14 192005 -> 240514_192005
				string fileName = Path.GetFileNameWithoutExtension(file.Name);
				string[] parts = fileName.Split(' ');
				if (parts.Length < 3) continue;

				string date = parts[1]; // 2024-05-14
				string time = parts[2]; // 192005

				date = date.Replace("-", "").Substring(2); // 240514

				string newName = $"{date}_{time}";
				string newFilePath = Path.Combine(path, newName + file.Extension);

				try
				{
					file.MoveTo(newFilePath);
					Log($"Renamed: {fileName} -> {newName}");
				}
				catch (IOException)
				{
					// 충돌
					string uniqueName = GetNewFileName(path, newName, 1);
					newFilePath = Path.Combine(path, uniqueName + file.Extension);
					file.MoveTo(newFilePath);
					Log($"Renamed (Collision): {fileName} -> {uniqueName}");
				}
				catch (Exception ex)
				{
					Log($"Failed: {fileName}. Error: {ex.Message}");
				}
			}
		}

		private void ChangeVRCScreenshotName(string path)
		{
			Log("VRC Screenshot logic not fully ported yet (placeholder).");
		}

		private void RemoveSomeString(string path, string removeString)
		{
			Log($"{nameof(RemoveSomeString)} called. Path: {path}, String: {removeString}");
			if (string.IsNullOrEmpty(removeString)) removeString = "-";

			if (!Directory.Exists(path))
			{
				Log("Folder does not exist.");
				return;
			}

			var dir = new DirectoryInfo(path);
			foreach (var file in dir.GetFiles())
			{
				if (file.Name.Contains(removeString))
				{
					string oldName = Path.GetFileNameWithoutExtension(file.Name);
					string newName = oldName.Replace(removeString, "");
					string newPath = Path.Combine(path, newName + file.Extension);
					try
					{
						file.MoveTo(newPath);
						Log($"Renamed: {file.Name} -> {newName + file.Extension}");
					}
					catch (Exception ex)
					{
						Log($"Failed to rename {file.Name}: {ex.Message}");
					}
				}
			}
		}

		private void FileNameToString(string path, string somePath)
		{
			Log($"{nameof(FileNameToString)} called. Path: {path}");

			if (!Directory.Exists(path))
			{
				Log("The provided folder path does not exist.");
				return;
			}

			if (path.Contains("Mascari4615.github.io\\assets\\project"))
			{
				if (somePath == TEMP_PATH || string.IsNullOrEmpty(somePath))
				{
					string[] split = path.Split(new[] { "project\\" }, StringSplitOptions.None);
					if (split.Length > 1)
					{
						somePath = split[1];
						somePath = somePath.Replace("\\", "/");
						somePath = "/assets/project/" + somePath;
					}
				}
			}

			DirectoryInfo directory = new(path);
			FileInfo[] files = directory.GetFiles();
			StringBuilder sb = new();

			foreach (FileInfo file in files)
			{
				string fileName = Path.GetFileNameWithoutExtension(file.Name);
				string result = $"![{fileName}]({somePath}/{file.Name})";
				sb.AppendLine(result);
			}

			Log(sb.ToString());
		}

		private void ChangeNameToDate(string path, string prefix)
		{
			Log($"{nameof(ChangeNameToDate)} called. Path: {path}");

			if (!Directory.Exists(path))
			{
				Log("The provided folder path does not exist.");
				return;
			}

			List<string> prefixes = new List<string>();
			bool notInvalidPrefix = !string.IsNullOrEmpty(prefix) && (prefix != TEMP_PATH);
			if (notInvalidPrefix) prefixes.Add(prefix);

			DirectoryInfo directory = new DirectoryInfo(path);
			FileInfo[] files = directory.GetFiles();
			Array.Sort(files, (x, y) => string.Compare(x.Name, y.Name, StringComparison.Ordinal));

			if (files.Length == 0)
			{
				Log("No files found.");
				return;
			}

			foreach (FileInfo file in files)
			{
				if (!FileNameStartsWith(file, prefixes)) continue;

				string fileName = Path.GetFileNameWithoutExtension(file.Name);
				string extension = file.Extension;

				DateTime dateTime = file.CreationTime;
				if (file.LastAccessTime < dateTime) dateTime = file.LastAccessTime;
				if (file.LastWriteTime < dateTime) dateTime = file.LastWriteTime;

				string newFileName = dateTime.ToString("yyMMdd-HHmmss");
				if (IsFileNameExists(path, newFileName))
				{
					newFileName = GetNewFileName(path, newFileName, 1);
				}

				string newFilePath = Path.Combine(path, newFileName + extension);
				try
				{
					file.MoveTo(newFilePath);
					Log($"Renamed: {fileName} -> {newFileName}");
				}
				catch (Exception e)
				{
					Log($"Failed to rename: {fileName} -> {newFileName}\n{e.Message}");
				}
			}
		}

		private void ModSubIndex(string path, string prefix)
		{
			Log($"{nameof(ModSubIndex)} called. Path: {path}");
			if (!Directory.Exists(path)) return;

			DirectoryInfo directory = new DirectoryInfo(path);
			FileInfo[] files = directory.GetFiles();

			bool IsThatSubIndexExists(int subIndex)
			{
				string subIndexStr = subIndex.ToString().PadLeft(2, '0');
				return files.Any(f => f.Name.Contains($"{prefix}_{subIndexStr}"));
			}

			int minIndex = 2;

			foreach (FileInfo file in files)
			{
				if (!file.Name.StartsWith(prefix)) continue;

				string fileName = Path.GetFileNameWithoutExtension(file.Name);
				string[] parts = fileName.Split('_');

				if (parts.Length < 3) continue; // date_time_index 형식 기대

				string date = parts[0];
				string time = parts[1];
				string subIndexStr = parts[2];
				if (!int.TryParse(subIndexStr, out int subIndexInt)) continue;

				while (IsThatSubIndexExists(minIndex)) minIndex++;

				if (minIndex == subIndexInt) continue;

				string newFileName = $"{date}_{time}_{minIndex:D2}";
				string newFilePath = Path.Combine(path, newFileName + file.Extension);
				try
				{
					file.MoveTo(newFilePath);
					Log($"Renamed: {fileName} -> {newFileName}");
				}
				catch (Exception ex)
				{
					Log(ex.Message);
				}
			}
		}

		private void ConvertCase(string path, string toUpperString)
		{
			Log($"{nameof(ConvertCase)} called. Path: {path}");
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
				string newPath = Path.Combine(path, newName);
				file.MoveTo(newPath);
				Log($"Renamed: {file.Name} -> {newName}");
			}

			foreach (var subDir in directory.GetDirectories())
			{
				string newSubName = toUpper ? subDir.Name.ToUpper() : subDir.Name.ToLower();
				if (subDir.Name != newSubName)
				{
					string tempPath = Path.Combine(path, "temp_" + subDir.Name);
					subDir.MoveTo(tempPath);
					string finalPath = Path.Combine(path, newSubName);
					subDir.MoveTo(finalPath);
					Log($"Renamed Dir: {subDir.Name} -> {newSubName}");
				}
				ConvertCaseInDirectory(Path.Combine(path, newSubName), toUpper);
			}
		}

		private void ConvertString(string path, string data)
		{
			Log($"{nameof(ConvertString)} called. Path: {path}");
			if (!Directory.Exists(path)) return;

			string[] split = data.Split(',');
			if (split.Length < 2)
			{
				Log("ConvertString requires Input in format 'From,To'");
				return;
			}
			string from = split[0].Trim();
			string to = split[1].Trim();

			ConvertStringInDirectory(path, from, to);
		}

		private void ConvertStringInDirectory(string path, string from, string to)
		{
			DirectoryInfo directory = new DirectoryInfo(path);
			foreach (FileInfo file in directory.GetFiles())
			{
				string newName = file.Name.Replace(from, to);
				if (file.Name == newName) continue;
				string newPath = Path.Combine(path, newName);
				file.MoveTo(newPath);
				Log($"Renamed: {file.Name} -> {newName}");
			}

			foreach (var subDir in directory.GetDirectories())
			{
				string newSubName = subDir.Name.Replace(from, to);
				if (subDir.Name != newSubName)
				{
					string tempPath = Path.Combine(path, "temp_" + subDir.Name);
					subDir.MoveTo(tempPath);
					string finalPath = Path.Combine(path, newSubName);
					subDir.MoveTo(finalPath);
					Log($"Renamed Dir: {subDir.Name} -> {newSubName}");
				}
				ConvertStringInDirectory(Path.Combine(path, newSubName), from, to);
			}
		}

		private void Func4(string path)
		{
			Log($"{nameof(Func4)} called. Path: {path}");

			if (!Directory.Exists(path))
			{
				Log("The provided folder path does not exist.");
				return;
			}

			string prefix = "2023";
			DirectoryInfo directory = new DirectoryInfo(path);
			FileInfo[] files = directory.GetFiles();

			foreach (FileInfo file in files)
			{
				if (file.Name.StartsWith(prefix))
				{
					string newFileName = file.Name.Substring(2);
					string newFilePath = Path.Combine(path, newFileName);
					try
					{
						file.MoveTo(newFilePath);
						Log($"Renamed: {file.Name} -> {newFileName}");
					}
					catch (Exception ex)
					{
						Log($"Failed: {file.Name} -> {ex.Message}");
					}
				}
			}
		}
	}
}

