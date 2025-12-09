using UnityEngine;
using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Collections.Generic;

namespace KarmoLab
{
	public partial class FileNameManager : ButtonContent
	{
		private static void ChangeNameToDate(string path, string prefix)
		{
			MLog.Log($"{nameof(ChangeNameToDate)} is called.");
			MLog.Log($"Path: {path}");

			string folderPath = path;
			if (!Directory.Exists(folderPath))
			{
				MLog.Log("The provided folder path does not exist.");
				return;
			}

			List<string> prefixes = new();
			bool notInvalidPrefix = string.IsNullOrEmpty(prefix) || (prefix == TEMP_PATH);
			if (notInvalidPrefix == false)
			{
				prefixes.Add(prefix);
			}
			Debug.Log($"{nameof(prefixes)}: {string.Join(", ", prefixes)}");

			DirectoryInfo directory = new(folderPath);
			FileInfo[] files = directory.GetFiles();
			Array.Sort(files, (x, y) => string.Compare(x.Name, y.Name, StringComparison.Ordinal)); // 이름 순으로 정렬

			if (files.Length == 0)
			{
				MLog.Log("No files found.");
				return;
			}

			foreach (FileInfo file in files)
			{
				bool isMatched = FileNameUtil.FileNameStartsWith(file, prefixes);
				if (isMatched == false)
				{
					MLog.Log($"File name does not match the prefix: {file.Name}");
					continue; // Skip files that do not match the prefix
				}

				string fileName = Path.GetFileNameWithoutExtension(file.Name);
				string extension = file.Extension;

				DateTime dateTime;
				{
					DateTime creationTime = file.CreationTime;
					DateTime lastWriteTime = file.LastWriteTime;
					DateTime lastAccessTime = file.LastAccessTime;

					// 가장 옛날 시간을 기준으로 파일 이름 변경
					dateTime = creationTime;
					dateTime = lastAccessTime < dateTime ? lastAccessTime : dateTime;
					dateTime = lastWriteTime < dateTime ? lastWriteTime : dateTime;
				}

				string newFileName = dateTime.ToString("yyMMdd-HHmmss");
				if (FileNameUtil.IsFileNameExists(folderPath, newFileName))
				{
					// 이미 존재하는 파일이 있을 경우, 파일 이름 뒤에 _1을 붙여서 다시 시도
					newFileName = FileNameUtil.GetNewFileName(folderPath, newFileName, 1);
				}

				string newFilePath = Path.Combine(folderPath, newFileName + extension);
				// string newFilePath = Path.Combine(folderPath, newFileName + ".png");

				try
				{
					file.MoveTo(newFilePath);
				}
				catch (Exception e)
				{
					MLog.Log($"Failed to rename: {fileName} -> {newFileName}\n{e.Message}");
				}

				MLog.Log($"Renamed: {fileName} -> {newFileName}");
			}
		}
	}
}