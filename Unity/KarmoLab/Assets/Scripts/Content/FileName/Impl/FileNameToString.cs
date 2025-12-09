using System;
using System.IO;
using System.Text;
using UnityEngine;

namespace KarmoLab
{
	public partial class FileNameManager : ButtonContent
	{
		// 경로 내 파일들의 이름을 포맷에 맞게 출력하는 함수
		public void FileNameToString(string path, string somePath)
		{
			MLog.Log($"{nameof(FileNameToString)} is called.");
			MLog.Log($"Path: {path}");

			string folderPath = path;
			if (Directory.Exists(folderPath) == false)
			{
				MLog.Log("The provided folder path does not exist.");
				return;
			}

			if (path.Contains("Mascari4615.github.io\\assets\\project"))
			{
				if (somePath == TEMP_PATH)
				{
					// path가 'C:\Users\masca\source\repos\_Mascari4615\Mascari4615.github.io\assets\project\ProjectName' 이런식으로 주어질 경우
					// assets\ 이후의 부분을 somePath로 설정

					string[] split = path.Split("project\\");
					somePath = split[1];
					somePath = somePath.Replace("\\", "/");
					somePath = "/assets/project/" + somePath;

					// 결과 예시: ![FileName](/assets/project/ProjectName/FileName.png)
				}
			}

			DirectoryInfo directory = new(folderPath);
			FileInfo[] files = directory.GetFiles();

			StringBuilder sb = new();

			foreach (FileInfo file in files)
			{
				// 확장자 없는 이름
				string fileName = Path.GetFileNameWithoutExtension(file.Name);
				string result = $"![{fileName}]({somePath}/{file.Name})";
				sb.AppendLine(result);
			}

			OutputResult(sb.ToString());
		}
	}
}