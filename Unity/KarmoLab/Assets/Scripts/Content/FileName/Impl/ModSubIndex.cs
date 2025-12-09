using UnityEngine;
using System;
using System.IO;
using System.Text.RegularExpressions;

namespace KarmoLab
{
	public partial class FileNameManager : ButtonContent
	{
		private static void ModSubIndex(string path, string prefix)
		{
			MLog.Log($"{nameof(ModSubIndex)} is called.");
			MLog.Log($"Path: {path}");

			string folderPath = path;
			if (Directory.Exists(folderPath) == false)
			{
				MLog.Log("The provided folder path does not exist.");
				return;
			}

			DirectoryInfo directory = new(folderPath);
			FileInfo[] files = directory.GetFiles();

			if (files.Length == 0)
			{
				MLog.Log("No files found.");
				return;
			}

			bool IsThatSubIndexExists(int subIndex)
			{
				string subIndexStr = subIndex.ToString().PadLeft(2, '0');
				foreach (FileInfo file in files)
				{
					if (file.Name.Contains($"{prefix}_{subIndexStr}"))
						return true;
				}
				return false;
			}

			int minIndex = 2;

			foreach (FileInfo file in files)
			{
				bool isMatched = file.Name.StartsWith(prefix);
				if (isMatched == false)
					continue;

				string fileName = Path.GetFileNameWithoutExtension(file.Name);
				string[] parts = fileName.Split('_');

				if (parts.Length == 2)
				{
					MLog.Log($"File name '{fileName}' does not contain enough parts. Skipping.");
					continue;
				}

				string date = parts[0];
				string time = parts[1];
				string subIndex = parts[2];
				int subIndexInt = int.Parse(subIndex);

				while (true)
				{
					if (IsThatSubIndexExists(minIndex) == false)
						break;

					minIndex++;
				}

				if (minIndex == subIndexInt)
				{
					continue;
				}

				string newFileName = $"{date}_{time}_{minIndex:D2}";
				string newFilePath = Path.Combine(folderPath, newFileName + file.Extension);

				try
				{
					file.MoveTo(newFilePath);
				}
				catch (Exception e)
				{
					MLog.Log($"Failed to rename: {file.Name} -> {newFileName}");
					MLog.Log(e.Message);

					return;
				}

				MLog.Log($"Renamed: {fileName} -> {newFileName}");
			}
		}
	}
}