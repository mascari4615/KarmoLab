using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;
using KarmoToys.Common.Data;
using KarmoToys.Features.QuestBoard;
using KarmoToys.Features.Planner;
using KarmoToys.Features.Note;
using KarmoToys.Features.Dashboard;

namespace KarmoToys.Core
{
	public static class DataService
	{
		/// <summary>
		/// ?�이??로드
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
					if (data.Planner == null) data.Planner = new PlannerData();

					// ?�위 ?�환?? SaveId가 ?�으�??�성
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
		/// ?�이???�??(백업 ?�그 ?�함, forceBackup=true�?무조�?백업)
		/// </summary>
		public static void Save(string path, KarmoToysData data, int maxBackups = 1000, string tag = "", bool forceBackup = false)
		{
			if (data == null) return;

			try
			{
				bool shouldBackup = forceBackup;

				// Force가 ?�닐 경우, ?�동 백업 ?�정 �?변경량 체크
				if (!shouldBackup && data.AutoBackupOnSave)
				{
					// 1. 가??최근 백업 ?�일 찾기
					List<FileInfo> backups = GetBackupFiles(path);
					FileInfo lastBackupIdx = backups.FirstOrDefault();

					if (lastBackupIdx != null && File.Exists(lastBackupIdx.FullName))
					{
						// 2. 최근 백업 ?�이?��? 비교 (?�적 변경량 체크)
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
							// 백업 로드 ?�패 ???�전?�게 ?�재 ?�일 기�??�로 비교?�거??백업 ?�행
							shouldBackup = true;
						}
					}
					else
					{
						// 3. 백업???�나???�으�?무조�??�성 (기�???마련)
						shouldBackup = true;
						if (string.IsNullOrEmpty(tag)) tag = "InitBackup";
					}
				}

				// 1. 조건 만족 ??백업 ?�성
				if (shouldBackup)
				{
					CreateBackup(path, maxBackups, tag); // SaveId Parameter Removed
				}

				// 2. ?�로???�일 ?�??
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
		/// 백업 ?�일 ?�성 �?개수 관�?(Flat Structure)
		/// </summary>
		private static void CreateBackup(string path, int maxBackups, string tag = "")
		{
			if (!File.Exists(path)) return;

			try
			{
				string dir = Path.GetDirectoryName(path);
				string backupDir = Path.Combine(dir, "Backups"); // ?�위 ?�더(SaveId) ?�거, 바로 Backups ?�더 ?�용

				if (!Directory.Exists(backupDir))
				{
					Directory.CreateDirectory(backupDir);
				}

				// 중복 ?�일 체크 (?�시 비교)
				FileInfo lastBackup = GetBackupFiles(path).FirstOrDefault();
				if (lastBackup != null)
				{
					if (GetFileHash(path) == GetFileHash(lastBackup.FullName))
					{
						Debug.Log($"[DataService] Redundant backup skipped: Content identical to last backup ({lastBackup.Name})");
						return;
					}
				}

				// ?�?�스?�프 ?�식??백업 ?�일�??�성
				string fileName = Path.GetFileNameWithoutExtension(path);
				string extension = Path.GetExtension(path);
				string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");

				string tagPart = string.IsNullOrEmpty(tag) ? "" : $"_{SanitizeFileName(tag)}";
				string backupPath = Path.Combine(backupDir, $"{fileName}_{timestamp}{tagPart}{extension}");

				File.Copy(path, backupPath, true);

				// 롤링 ?�린??(?�일�?기�? ?�터�??�요)
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
		/// ?�래??백업 ?�일 ??�� (?�당 ?�일명에 ?�당?�는 백업�?
		/// </summary>
		private static void CleanupOldBackups(string backupDir, string originalFileName, int maxBackups)
		{
			if (maxBackups <= 0) return;

			DirectoryInfo directoryInfo = new DirectoryInfo(backupDir);
			// ?�당 ?�본 ?�일??백업본만 ?�터�?(StartsWith)
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
		/// 백업 ?�일 목록 조회 (최신?? Flat Structure)
		/// </summary>
		public static List<FileInfo> GetBackupFiles(string mainPath)
		{
			string dir = Path.GetDirectoryName(mainPath);
			string backupDir = Path.Combine(dir, "Backups");

			if (!Directory.Exists(backupDir)) return new List<FileInfo>();

			string fileName = Path.GetFileNameWithoutExtension(mainPath);

			return new DirectoryInfo(backupDir).GetFiles()
				.Where(f => f.Name.StartsWith(fileName)) // ?�일명으�??�터�?
				.OrderByDescending(f => f.CreationTime)
				.ToList();
		}

		/// <summary>
		/// ?�정 백업 불러?�기 (불러?�기 ???�재 ?�이??Safety Backup ?�성)
		/// </summary>
		public static bool LoadBackup(string mainPath, string backupPath, int maxBackups)
		{
			if (!File.Exists(backupPath)) return false;

			try
			{
				// 1. ?�재 메인 ?�이?��? ?�으�?Safety Backup ?�성 (?�그: Safety)
				if (File.Exists(mainPath))
				{
					CreateBackup(mainPath, maxBackups, "Safety");
				}

				// 2. 백업 ?�일??메인 ?�이�??�치�???��?�기
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
		/// ?�각???�이??비교 (간이 Diff)
		/// </summary>
		public static string GetDiffSummary(KarmoToysData oldData, KarmoToysData newData)
		{
			if (oldData == null || newData == null) return "Comparison failed: Missing data.";

			StringBuilder sb = new StringBuilder();
			sb.AppendLine("<b>[Data Comparison Summary]</b>");

			// 1. Planner ?�벤??비교
			int oldBlocks = oldData.Planner?.TimeBlocks?.Count ?? 0;
			int newBlocks = newData.Planner?.TimeBlocks?.Count ?? 0;
			if (oldBlocks != newBlocks)
			{
				sb.AppendLine($"- ?�� TimeBlocks: {oldBlocks} -> {newBlocks} ({(newBlocks > oldBlocks ? "+" : "")}{newBlocks - oldBlocks})");
			}

			int oldItems = oldData.Planner?.Items?.Count ?? 0;
			int newItems = newData.Planner?.Items?.Count ?? 0;
			if (oldItems != newItems)
			{
				sb.AppendLine($"- ??Todo Items: {oldItems} -> {newItems} ({(newItems > oldItems ? "+" : "")}{newItems - oldItems})");
			}

			// 1.5 Secret Notes 비교
			int oldNotes = oldData.Planner?.SecretNotes?.Count ?? 0;
			int newNotes = newData.Planner?.SecretNotes?.Count ?? 0;
			if (oldNotes != newNotes)
			{
				sb.AppendLine($"- ?�� Secret Notes: {oldNotes} -> {newNotes} ({(newNotes > oldNotes ? "+" : "")}{newNotes - oldNotes})");
			}

			// 2. Life Weekly ?�정 비교
			if (oldData.LifeWeekly?.BirthDate != newData.LifeWeekly?.BirthDate)
			{
				sb.AppendLine($"- ?�� Birth Date changed: {oldData.LifeWeekly?.BirthDate} -> {newData.LifeWeekly?.BirthDate}");
			}
			if (oldData.LifeWeekly?.TargetAge != newData.LifeWeekly?.TargetAge)
			{
				sb.AppendLine($"- ??Target Age: {oldData.LifeWeekly?.TargetAge} -> {newData.LifeWeekly?.TargetAge}");
			}

			// 3. ?�마 비교
			if (oldData.Theme != newData.Theme)
			{
				sb.AppendLine($"- ?�� Theme: {oldData.Theme} -> {newData.Theme}");
			}

			// 4. Memo & Target Date 비교
			if (oldData.Planner?.MemoContent != newData.Planner?.MemoContent)
			{
				sb.AppendLine("- ?�� Memo Content changed.");
			}
			if (oldData.Planner?.TargetDateString != newData.Planner?.TargetDateString)
			{
				sb.AppendLine($"- ?�� Target Date: {oldData.Planner?.TargetDateString} -> {newData.Planner?.TargetDateString}");
			}

			// 5. TimeBlock Modification Check (New)
			int modifiedBlocks = 0;
			if (oldData.Planner?.TimeBlocks != null && newData.Planner?.TimeBlocks != null)
			{
				Dictionary<string, KarmoToys.Common.Data.TimeBlock> oldMap = oldData.Planner.TimeBlocks.ToDictionary(b => b.Id);
				foreach (KarmoToys.Common.Data.TimeBlock newBlock in newData.Planner.TimeBlocks)
				{
					if (oldMap.TryGetValue(newBlock.Id, out KarmoToys.Common.Data.TimeBlock oldBlock))
					{
						if (oldBlock.StartMinute != newBlock.StartMinute ||
							oldBlock.EndMinute != newBlock.EndMinute ||
							oldBlock.DateString != newBlock.DateString ||
							oldBlock.Title != newBlock.Title)
						{
							modifiedBlocks++;
						}
					}
				}
			}
			if (modifiedBlocks > 0)
			{
				sb.AppendLine($"- 🕒 Modified Events: {modifiedBlocks}");
			}

			// 6. Todo Modification Check (New)
			int modifiedTodos = 0;
			if (oldData.Planner?.Items != null && newData.Planner?.Items != null)
			{
				Dictionary<string, KarmoToys.Common.Data.TodoItem> oldMap = oldData.Planner.Items.ToDictionary(i => i.Id);
				foreach (KarmoToys.Common.Data.TodoItem newItem in newData.Planner.Items)
				{
					if (oldMap.TryGetValue(newItem.Id, out KarmoToys.Common.Data.TodoItem oldItem))
					{
						if (oldItem.IsCompleted != newItem.IsCompleted ||
							oldItem.Content != newItem.Content)
						{
							modifiedTodos++;
						}
					}
				}
			}
			if (modifiedTodos > 0)
			{
				sb.AppendLine($"- ?�️ Modified Todos: {modifiedTodos}");
			}

			if (sb.Length < 40) // ?�목�??�는 경우
			{
				sb.AppendLine("- No significant changes detected.");
			}

			return sb.ToString();
		}

		private static bool HasSignificantChanges(KarmoToysData oldData, KarmoToysData newData, int threshold)
		{
			if (oldData == null || newData == null) return true;

			int changes = 0;

			// Planner TimeBlocks (Count & Modification)
			List<KarmoToys.Common.Data.TimeBlock> oldList = oldData.Planner?.TimeBlocks ?? new List<KarmoToys.Common.Data.TimeBlock>();
			List<KarmoToys.Common.Data.TimeBlock> newList = newData.Planner?.TimeBlocks ?? new List<KarmoToys.Common.Data.TimeBlock>();

			int countDiff = Math.Abs(newList.Count - oldList.Count);
			changes += countDiff;

			// ?�용 변�?체크 (개수 차이?� 별도�??�행)
			// ?�능 최적?? Dictionary 빌드??비용???��?�?리스?��? ?��? ?�다�??�용 가??
			// ?�기?�는 루프�??�며 ID 매칭???�도.
			Dictionary<string, KarmoToys.Common.Data.TimeBlock> oldMap = oldList.ToDictionary(b => b.Id);
			foreach (KarmoToys.Common.Data.TimeBlock newBlock in newList)
			{
				if (oldMap.TryGetValue(newBlock.Id, out KarmoToys.Common.Data.TimeBlock oldBlock))
				{
					if (oldBlock.StartMinute != newBlock.StartMinute ||
						oldBlock.EndMinute != newBlock.EndMinute ||
						oldBlock.DateString != newBlock.DateString ||
						oldBlock.Title != newBlock.Title)
					{
						changes++;
					}
				}
			}

			// Planner TodoItems (Count & Modification)
			List<KarmoToys.Common.Data.TodoItem> oldTodos = oldData.Planner?.Items ?? new List<KarmoToys.Common.Data.TodoItem>();
			List<KarmoToys.Common.Data.TodoItem> newTodos = newData.Planner?.Items ?? new List<KarmoToys.Common.Data.TodoItem>();

			changes += Math.Abs(newTodos.Count - oldTodos.Count);

			Dictionary<string, KarmoToys.Common.Data.TodoItem> oldTodoMap = oldTodos.ToDictionary(i => i.Id);
			foreach (var newItem in newTodos)
			{
				if (oldTodoMap.TryGetValue(newItem.Id, out var oldItem))
				{
					if (oldItem.IsCompleted != newItem.IsCompleted ||
						oldItem.Content != newItem.Content)
					{
						// ?�료 ?��? 변경이???�용 변�?모두 1건의 변경으�?취급
						changes++;
					}
				}
			}

			// Planner SecretNotes (Count & Modification)
			List<KarmoToys.Common.Data.SecretNote> oldNotes = oldData.Planner?.SecretNotes ?? new List<KarmoToys.Common.Data.SecretNote>();
			List<KarmoToys.Common.Data.SecretNote> newNotes = newData.Planner?.SecretNotes ?? new List<KarmoToys.Common.Data.SecretNote>();
			changes += Math.Abs(newNotes.Count - oldNotes.Count);

			Dictionary<string, KarmoToys.Common.Data.SecretNote> oldNoteMap = oldNotes.ToDictionary(n => n.Id);
			foreach (KarmoToys.Common.Data.SecretNote newNote in newNotes)
			{
				if (oldNoteMap.TryGetValue(newNote.Id, out KarmoToys.Common.Data.SecretNote oldNote))
				{
					if (oldNote.Problem != newNote.Problem ||
						oldNote.Why != newNote.Why ||
						oldNote.Solution != newNote.Solution)
					{
						changes++;
					}
				}
			}

			// 중요 ?�정 변경�? 1건이?�도 ?�으�?즉시 true (threshold 무시)
			if (oldData.LifeWeekly?.BirthDate != newData.LifeWeekly?.BirthDate) return true;
			if (oldData.Theme != newData.Theme) return true;

			// Memo & Target Date
			if (oldData.Planner?.MemoContent != newData.Planner?.MemoContent) changes++;
			if (oldData.Planner?.TargetDateString != newData.Planner?.TargetDateString) changes++;

			return changes >= threshold;
		}
	}
}
