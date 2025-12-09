using System;
using System.IO;
using UnityEngine;

namespace KarmoLab
{
	public partial class FileNameManager : ButtonContent
	{
		// 경로 내 파일들의 이름을 lowercase로 바꾸는 함수
		public void ConvertString(string path, string data)
		{
			MLog.Log($"{nameof(ConvertCase)} is called.");
			MLog.Log($"Path: {path}");

			if (Directory.Exists(path) == false)
			{
				MLog.Log("The provided folder path does not exist.");
				return;
			}

			string[] split = data.Split(',');
			string from = split[0].Trim();
			string to = split[1].Trim();
			
			ConvertStringInDirectory(path, from, to);
		}

		private void ConvertStringInDirectory(string path, string from, string to)
		{
			DirectoryInfo directory = new(path);
			FileInfo[] files = directory.GetFiles();

			foreach (FileInfo file in files)
			{
				string newFileName = file.Name.Replace(from, to);

				if (file.Name == newFileName)
					continue;

				MLog.Log($"Rename: {file.Name} -> {newFileName}");
				string newFilePath = Path.Combine(directory.FullName, newFileName);
				file.MoveTo(newFilePath);
			}

			// 하위 디렉토리도 재귀적으로 처리
			DirectoryInfo[] subDirectories = directory.GetDirectories();
			foreach (DirectoryInfo subDirectory in subDirectories)
			{
				// 하위 디렉토리의 이름을 변경
				string newSubDirectoryName = subDirectory.Name.Replace(from, to);

				if (subDirectory.Name != newSubDirectoryName)
				{
					MLog.Log($"Rename Directory: {subDirectory.Name} -> {newSubDirectoryName}");

					// window에서 대문자와 소문자 구분을 하지 않기 때문에, IOException: Source and destination path must be different. 예외가 발생.
					// 때문에 temp 경로로 한 번 이동 후, 원래 목적지로 이동

					string tempPath = Path.Combine(directory.FullName, "temp_" + subDirectory.Name);
					subDirectory.MoveTo(tempPath);

					string newSubDirectoryPath = Path.Combine(directory.FullName, newSubDirectoryName);
					subDirectory.MoveTo(newSubDirectoryPath);
				}

				ConvertStringInDirectory(subDirectory.FullName, from, to);
			}
		}
	}
}