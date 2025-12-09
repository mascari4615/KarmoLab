using System;
using System.IO;
using System.Text.RegularExpressions;
using UnityEngine;

namespace KarmoLab
{
	public class KarmoRegex
	{
		public static void Func4(string path)
		{
			// 앞 2자리 제거
			string folderPath = path;
			if (!Directory.Exists(folderPath))
			{
				MLog.Log("The provided folder path does not exist.");
				return;
			}

			string prefix = "2023";
			DirectoryInfo directory = new DirectoryInfo(folderPath);
			FileInfo[] files = directory.GetFiles();

			foreach (FileInfo file in files)
			{
				if (file.Name.StartsWith(prefix))
				{
					string newFileName = file.Name.Substring(2);
					string newFilePath = Path.Combine(folderPath, newFileName);
					file.MoveTo(newFilePath);
					MLog.Log($"Renamed: {file.Name} -> {newFileName}");
				}
			}
		}
	}
}