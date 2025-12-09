using UnityEngine;
using System;
using System.Collections.Generic;
using System.IO;

namespace KarmoLab
{
	public static class FileNameUtil
	{
		private const string SUB_INDEX_PREFIX = "-";

		// 확장자 제외, 파일 이름만 비교
		// https://stackoverflow.com/questions/22641503/check-if-file-exists-not-knowing-the-extension
		public static bool IsFileNameExists(string folderPath, string targetName)
		{
			int exists = Directory.GetFiles($"{folderPath}/", $"{targetName}.*").Length;
			return exists > 0;
		}

		public static string GetNewFileName(string folderPath, string targetName, int subIndex)
		{
			string leading2SubIndex = subIndex.ToString().PadLeft(2, '0');
			string newFileName = $"{targetName}{SUB_INDEX_PREFIX}{leading2SubIndex}";

			// if (File.Exists(Path.Combine(folderPath, $"{targetName}{SUB_INDEX_PREFIX}{subIndex}{extension}")))
			if (IsFileNameExists(folderPath, newFileName))
				return GetNewFileName(folderPath, targetName, subIndex + 1);
			else
				return newFileName;
		}

		public static bool FileNameStartsWith(FileInfo fileInfo, List<string> prefixes)
		{
			if ((prefixes == null) || (prefixes.Count == 0))
			{
				return true; // No prefixes provided, consider it a match
			}

			foreach (string prefix in prefixes)
			{
				if (string.IsNullOrEmpty(prefix) || (prefix == FileNameManager.TEMP_PATH))
				{
					continue; // Skip empty prefixes
				}

				if (fileInfo.Name.StartsWith(prefix))
				{
					return true; // Match found
				}
			}
			return false; // No match found
		}
	}
}