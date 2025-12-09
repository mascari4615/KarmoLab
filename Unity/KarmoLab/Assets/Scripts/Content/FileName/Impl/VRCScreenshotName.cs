using UnityEngine;
using System;
using System.IO;
using System.Text.RegularExpressions;

namespace KarmoLab
{
	public partial class FileNameManager : ButtonContent
	{
		private static void ChangeVRCScreenshotName(string path)
		{
			MLog.Log($"{nameof(ChangeVRCScreenshotName)} is called.");
			MLog.Log($"Path: {path}");

			string folderPath = path;
			if (!Directory.Exists(folderPath))
			{
				MLog.Log("The provided folder path does not exist.");
				return;
			}

			string prefix = "VRChat_";
			DirectoryInfo directory = new(folderPath);
			FileInfo[] files = directory.GetFiles();

			if (files.Length == 0)
			{
				MLog.Log("No files found.");
				return;
			}

			foreach (FileInfo file in files)
			{
				string fileName = Path.GetFileNameWithoutExtension(file.Name);

				if (fileName.StartsWith(prefix))
				{
					// Regular expression
					// ^VRChat_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.\d{3}_\d+x\d+$
					// $1$2$3_$4$5$6.png

					string[] parts = fileName.Split('_', '.');

					string date;
					string time;

					if (parts[1].Contains("x"))
					{
						// VRChat_1920x1080_2022-07-11_23-31-38.311
						// to
						// 220711_233138.png

						date = parts[2];
						time = parts[3];
					}
					else
					{
						// VRChat_2024-11-04_19-09-40.662_1920x1080
						// to
						// 241104_190940.png

						date = parts[1];
						time = parts[2];
					}

					// 2024-11-04 -> 241104
					// date = date.Replace("-", "").Substring(2);
					date = date.Replace("-", "")[2..];

					// 19-09-40 -> 190940
					time = time.Replace("-", "");

					string newFileName = $"{date}_{time}";
					string newFilePath = Path.Combine(folderPath, newFileName + file.Extension);

					try
					{
						file.MoveTo(newFilePath);
					}
					catch (Exception e)
					{
						MLog.Log($"Failed to rename: {file.Name} -> {newFileName}");
						MLog.Log(e.Message);

						// 이미 존재하는 파일이 있을 경우, 파일 이름 뒤에 _1을 붙여서 다시 시도
						string newName = FileNameUtil.GetNewFileName(folderPath, newFileName, 1);
						newFilePath = Path.Combine(folderPath, newName + file.Extension);
						file.MoveTo(newFilePath);
					}

					MLog.Log($"Renamed: {file.Name} -> {newFileName}");
				}
			}
		}
	}
}