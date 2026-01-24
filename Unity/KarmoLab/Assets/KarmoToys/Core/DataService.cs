using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;
using KarmoToys.Common.Data;
using KarmoToys.Features.Planner;
using KarmoToys.Features.Dashboard;

namespace KarmoToys.Core
{
	public static class DataService
	{
		/// <summary>
		/// 데이터 로드
		/// </summary>
		public static KarmoToysData Load(string path)
		{
			if (File.Exists(path))
			{
				try
				{
					string json = File.ReadAllText(path);
					KarmoToysData data = JsonUtility.FromJson<KarmoToysData>(json);

					if (data == null) data = new KarmoToysData();

					// 하위 호환성: SaveId가 없으면 생성
					if (string.IsNullOrEmpty(data.SaveId))
					{
						data.SaveId = Guid.NewGuid().ToString();
					}

					return data;
				}
				catch (Exception ex)
				{
					Debug.LogWarning($"[DataService] Failed to load data from {path}: {ex.Message}. Creating new.");
					return new KarmoToysData();
				}
			}
			return new KarmoToysData();
		}

		/// <summary>
		/// 데이터 저장 (백업 태그 포함, forceBackup=true면 무조건 백업)
		/// </summary>
		public static void Save(string path, KarmoToysData data, int maxBackups = 1000, string tag = "", bool forceBackup = false)
		{
			if (data == null) return;

			try
			{
				bool shouldBackup = forceBackup;

				// Force가 아닐 경우, 자동 백업 설정 및 변경량 체크
				if (!shouldBackup && data.AutoBackupOnSave)
				{
					// 1. 가장 최근 백업 파일 찾기
					List<FileInfo> backups = GetBackupFiles(path);
					FileInfo lastBackupIdx = backups.FirstOrDefault();

					if (lastBackupIdx != null && File.Exists(lastBackupIdx.FullName))
					{
						// 2. 최근 백업 데이터와 비교 (누적 변경량 체크)
						try
						{
							KarmoToysData lastBackupData = Load(lastBackupIdx.FullName);
							if (HasSignificantChanges(lastBackupData, data, data.SignificantChangeThreshold))
							{
								shouldBackup = true;
								if (string.IsNullOrEmpty(tag)) tag = "AutoSave";
							}
						}
						catch
						{
							// 백업 로드 실패 시 안전하게 현재 파일 기준으로 비교하거나 백업 실행
							shouldBackup = true;
						}
					}
					else
					{
						// 3. 백업이 하나라도 없으면 무조건 생성 (기초 마련)
						shouldBackup = true;
						if (string.IsNullOrEmpty(tag)) tag = "InitBackup";
					}
				}

				// 1. 조건 만족 시 백업 생성
				if (shouldBackup)
				{
					CreateBackup(path, maxBackups, tag);
				}

				// 2. 새로운 파일 저장
				string dir = Path.GetDirectoryName(path);
				if (!Directory.Exists(dir) && !string.IsNullOrEmpty(dir))
				{
					Directory.CreateDirectory(dir);
				}

				string json = JsonUtility.ToJson(data, true);
				File.WriteAllText(path, json);
			}
			catch (Exception ex)
			{
				Debug.LogError($"[DataService] Failed to save data: {ex.Message}");
			}
		}

		/// <summary>
		/// 백업 파일 생성 및 개수 관리 (Flat Structure)
		/// </summary>
		private static void CreateBackup(string path, int maxBackups, string tag = "")
		{
			if (!File.Exists(path)) return;

			try
			{
				string dir = Path.GetDirectoryName(path);
				string backupDir = Path.Combine(dir, "Backups");

				if (!Directory.Exists(backupDir))
				{
					Directory.CreateDirectory(backupDir);
				}

				// 중복 파일 체크 (해시 비교)
				FileInfo lastBackup = GetBackupFiles(path).FirstOrDefault();
				if (lastBackup != null)
				{
					if (GetFileHash(path) == GetFileHash(lastBackup.FullName))
					{
						Debug.Log($"[DataService] Redundant backup skipped: Content identical to last backup ({lastBackup.Name})");
						return;
					}
				}

				// 타임스탬프 형식의 백업 파일명 생성
				string fileName = Path.GetFileNameWithoutExtension(path);
				string extension = Path.GetExtension(path);
				string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");

				string tagPart = string.IsNullOrEmpty(tag) ? "" : $"_{SanitizeFileName(tag)}";
				string backupPath = Path.Combine(backupDir, $"{fileName}_{timestamp}{tagPart}{extension}");

				File.Copy(path, backupPath, true);

				// 롤링 클린업
				CleanupOldBackups(backupDir, fileName, maxBackups);
			}
			catch (Exception ex)
			{
				Debug.LogWarning($"[DataService] Failed to create backup: {ex.Message}");
			}
		}

		private static string GetFileHash(string path)
		{
			if (!File.Exists(path)) return string.Empty;
			using (MD5 md5 = MD5.Create())
			{
				using (FileStream stream = File.OpenRead(path))
				{
					byte[] hash = md5.ComputeHash(stream);
					return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
				}
			}
		}

		private static string SanitizeFileName(string name)
		{
			foreach (char c in Path.GetInvalidFileNameChars())
			{
				name = name.Replace(c, '_');
			}
			return name.Replace(' ', '_');
		}

		/// <summary>
		/// 오래된 백업 파일 제거 (해당 파일명에 해당하는 백업만)
		/// </summary>
		private static void CleanupOldBackups(string backupDir, string originalFileName, int maxBackups)
		{
			if (maxBackups <= 0) return;

			DirectoryInfo directoryInfo = new DirectoryInfo(backupDir);
			List<FileInfo> files = directoryInfo.GetFiles()
				.Where(f => f.Name.StartsWith(originalFileName))
				.OrderBy(f => f.CreationTime)
				.ToList();

			if (files.Count > maxBackups)
			{
				int deleteCount = files.Count - maxBackups;
				for (int i = 0; i < deleteCount; i++)
				{
					try
					{
						files[i].Delete();
					}
					catch (Exception ex)
					{
						Debug.LogWarning($"[DataService] Failed to delete old backup: {ex.Message}");
					}
				}
			}
		}

		/// <summary>
		/// 백업 파일 목록 조회 (최신순)
		/// </summary>
		public static List<FileInfo> GetBackupFiles(string mainPath)
		{
			string dir = Path.GetDirectoryName(mainPath);
			string backupDir = Path.Combine(dir, "Backups");

			if (!Directory.Exists(backupDir)) return new List<FileInfo>();

			string fileName = Path.GetFileNameWithoutExtension(mainPath);

			return new DirectoryInfo(backupDir).GetFiles()
				.Where(f => f.Name.StartsWith(fileName))
				.OrderByDescending(f => f.CreationTime)
				.ToList();
		}

		/// <summary>
		/// 특정 백업 불러오기 (불러오기 전 현재 데이터 Safety Backup 생성)
		/// </summary>
		public static bool LoadBackup(string mainPath, string backupPath, int maxBackups)
		{
			if (!File.Exists(backupPath)) return false;

			try
			{
				if (File.Exists(mainPath))
				{
					CreateBackup(mainPath, maxBackups, "Safety");
				}

				File.Copy(backupPath, mainPath, true);
				return true;
			}
			catch (Exception ex)
			{
				Debug.LogError($"[DataService] Failed to load backup: {ex.Message}");
				return false;
			}
		}

		/// <summary>
		/// 시각적 데이터 비교 (간이 Diff)
		/// </summary>
		public static string GetDiffSummary(KarmoToysData oldData, KarmoToysData newData)
		{
			if (oldData == null || newData == null) return "Comparison failed: Missing data.";

			StringBuilder sb = new StringBuilder();
			sb.AppendLine("<b>[Data Comparison Summary]</b>");

			// 1.5 ProjectItems (통합 데이터) 비교
			int oldProjectItems = oldData.ProjectItems?.Count ?? 0;
			int newProjectItems = newData.ProjectItems?.Count ?? 0;
			if (oldProjectItems != newProjectItems)
			{
				sb.AppendLine($"- 🚀 Project Items: {oldProjectItems} -> {newProjectItems} ({(newProjectItems > oldProjectItems ? "+" : "")}{newProjectItems - oldProjectItems})");
			}

			// 2. Life Weekly 설정 비교
			if (oldData.LifeWeekly?.BirthDate != newData.LifeWeekly?.BirthDate)
			{
				sb.AppendLine($"- 🎂 Birth Date changed: {oldData.LifeWeekly?.BirthDate} -> {newData.LifeWeekly?.BirthDate}");
			}
			if (oldData.LifeWeekly?.TargetAge != newData.LifeWeekly?.TargetAge)
			{
				sb.AppendLine($"- 🎯 Target Age: {oldData.LifeWeekly?.TargetAge} -> {newData.LifeWeekly?.TargetAge}");
			}

			// 3. 테마 비교
			if (oldData.Theme != newData.Theme)
			{
				sb.AppendLine($"- 🎨 Theme: {oldData.Theme} -> {newData.Theme}");
			}

			// 6. ProjectItem Modification Check
			int modifiedProjectItems = 0;
			if (oldData.ProjectItems != null && newData.ProjectItems != null)
			{
				Dictionary<string, ProjectItemData> oldMap = oldData.ProjectItems.ToDictionary(i => i.Id);
				foreach (var newItem in newData.ProjectItems)
				{
					if (oldMap.TryGetValue(newItem.Id, out var oldItem))
					{
						if (oldItem.Status != newItem.Status ||
							oldItem.Title != newItem.Title ||
							oldItem.Content != newItem.Content ||
							oldItem.Priority != newItem.Priority)
						{
							modifiedProjectItems++;
						}
					}
				}
			}
			if (modifiedProjectItems > 0)
			{
				sb.AppendLine($"- 🚀 Modified Project Items: {modifiedProjectItems}");
			}

			if (sb.Length < 40) // 항목이 없는 경우
			{
				sb.AppendLine("- No significant changes detected.");
			}

			return sb.ToString();
		}

		private static bool HasSignificantChanges(KarmoToysData oldData, KarmoToysData newData, int threshold)
		{
			if (oldData == null || newData == null) return true;

			int changes = 0;

			// ProjectItems (Count & Modification)
			List<ProjectItemData> oldProjectItems = oldData.ProjectItems ?? new List<ProjectItemData>();
			List<ProjectItemData> newProjectItems = newData.ProjectItems ?? new List<ProjectItemData>();
			changes += Math.Abs(newProjectItems.Count - oldProjectItems.Count);

			Dictionary<string, ProjectItemData> oldProjectMap = oldProjectItems.ToDictionary(i => i.Id);
			foreach (var newItem in newProjectItems)
			{
				if (oldProjectMap.TryGetValue(newItem.Id, out var oldItem))
				{
					if (oldItem.Status != newItem.Status ||
						oldItem.Title != newItem.Title ||
						oldItem.Content != newItem.Content ||
						oldItem.Priority != newItem.Priority)
					{
						changes++;
					}
				}
			}

			// 중요 설정 변경은 1건이라도 있으면 즉시 true (threshold 무시)
			if (oldData.LifeWeekly?.BirthDate != newData.LifeWeekly?.BirthDate) return true;
			if (oldData.Theme != newData.Theme) return true;

			return changes >= threshold;
		}
	}
}
