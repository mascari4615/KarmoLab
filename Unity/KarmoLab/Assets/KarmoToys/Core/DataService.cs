using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;
using KarmoToys.Common.Data;

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
					var data = JsonUtility.FromJson<KarmoToysData>(json);

					if (data == null) data = new KarmoToysData();
					if (data.Planner == null) data.Planner = new PlannerData();

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
					var backups = GetBackupFiles(path);
					var lastBackupIdx = backups.FirstOrDefault();

					if (lastBackupIdx != null && File.Exists(lastBackupIdx.FullName))
					{
						// 2. 최근 백업 데이터와 비교 (누적 변경량 체크)
						try
						{
							var lastBackupData = Load(lastBackupIdx.FullName);
							if (HasSignificantChanges(lastBackupData, data, data.SignificantChangeThreshold))
							{
								shouldBackup = true;
								if (string.IsNullOrEmpty(tag)) tag = "AutoSave";
							}
						}
						catch
						{
							// 백업 로드 실패 시 안전하게 현재 파일 기준으로 비교하거나 백업 수행
							shouldBackup = true;
						}
					}
					else
					{
						// 3. 백업이 하나도 없으면 무조건 생성 (기준점 마련)
						shouldBackup = true;
						if (string.IsNullOrEmpty(tag)) tag = "InitBackup";
					}
				}

				// 1. 조건 만족 시 백업 생성
				if (shouldBackup)
				{
					CreateBackup(path, maxBackups, tag); // SaveId Parameter Removed
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
				string backupDir = Path.Combine(dir, "Backups"); // 하위 폴더(SaveId) 제거, 바로 Backups 폴더 사용

				if (!Directory.Exists(backupDir))
				{
					Directory.CreateDirectory(backupDir);
				}

				// 중복 파일 체크 (해시 비교)
				var lastBackup = GetBackupFiles(path).FirstOrDefault();
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

				// 롤링 클린업 (파일명 기준 필터링 필요)
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
			using var md5 = MD5.Create();
			using var stream = File.OpenRead(path);
			var hash = md5.ComputeHash(stream);
			return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
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
		/// 오래된 백업 파일 삭제 (해당 파일명에 해당하는 백업만)
		/// </summary>
		private static void CleanupOldBackups(string backupDir, string originalFileName, int maxBackups)
		{
			if (maxBackups <= 0) return;

			var directoryInfo = new DirectoryInfo(backupDir);
			// 해당 원본 파일의 백업본만 필터링 (StartsWith)
			var files = directoryInfo.GetFiles()
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
		/// 백업 파일 목록 조회 (최신순, Flat Structure)
		/// </summary>
		public static List<FileInfo> GetBackupFiles(string mainPath)
		{
			string dir = Path.GetDirectoryName(mainPath);
			string backupDir = Path.Combine(dir, "Backups");

			if (!Directory.Exists(backupDir)) return new List<FileInfo>();

			string fileName = Path.GetFileNameWithoutExtension(mainPath);

			return new DirectoryInfo(backupDir).GetFiles()
				.Where(f => f.Name.StartsWith(fileName)) // 파일명으로 필터링
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
				// 1. 현재 메인 데이터가 있으면 Safety Backup 생성 (태그: Safety)
				if (File.Exists(mainPath))
				{
					CreateBackup(mainPath, maxBackups, "Safety");
				}

				// 2. 백업 파일을 메인 세이브 위치로 덮어쓰기
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

			// 1. Planner 이벤트 비교
			int oldBlocks = oldData.Planner?.TimeBlocks?.Count ?? 0;
			int newBlocks = newData.Planner?.TimeBlocks?.Count ?? 0;
			if (oldBlocks != newBlocks)
			{
				sb.AppendLine($"- 📅 TimeBlocks: {oldBlocks} -> {newBlocks} ({(newBlocks > oldBlocks ? "+" : "")}{newBlocks - oldBlocks})");
			}

			int oldItems = oldData.Planner?.Items?.Count ?? 0;
			int newItems = newData.Planner?.Items?.Count ?? 0;
			if (oldItems != newItems)
			{
				sb.AppendLine($"- ✅ Todo Items: {oldItems} -> {newItems} ({(newItems > oldItems ? "+" : "")}{newItems - oldItems})");
			}

			// 1.5 Secret Notes 비교
			int oldNotes = oldData.Planner?.SecretNotes?.Count ?? 0;
			int newNotes = newData.Planner?.SecretNotes?.Count ?? 0;
			if (oldNotes != newNotes)
			{
				sb.AppendLine($"- 🔒 Secret Notes: {oldNotes} -> {newNotes} ({(newNotes > oldNotes ? "+" : "")}{newNotes - oldNotes})");
			}

			// 2. Life Weekly 설정 비교
			if (oldData.LifeWeekly?.BirthDate != newData.LifeWeekly?.BirthDate)
			{
				sb.AppendLine($"- 🎂 Birth Date changed: {oldData.LifeWeekly?.BirthDate} -> {newData.LifeWeekly?.BirthDate}");
			}
			if (oldData.LifeWeekly?.TargetAge != newData.LifeWeekly?.TargetAge)
			{
				sb.AppendLine($"- ⏳ Target Age: {oldData.LifeWeekly?.TargetAge} -> {newData.LifeWeekly?.TargetAge}");
			}

			// 3. 테마 비교
			if (oldData.Theme != newData.Theme)
			{
				sb.AppendLine($"- 🎨 Theme: {oldData.Theme} -> {newData.Theme}");
			}

			// 4. Memo & Target Date 비교
			if (oldData.Planner?.MemoContent != newData.Planner?.MemoContent)
			{
				sb.AppendLine("- 📝 Memo Content changed.");
			}
			if (oldData.Planner?.TargetDateString != newData.Planner?.TargetDateString)
			{
				sb.AppendLine($"- 🎯 Target Date: {oldData.Planner?.TargetDateString} -> {newData.Planner?.TargetDateString}");
			}

			// 5. TimeBlock Modification Check (New)
			int modifiedBlocks = 0;
			if (oldData.Planner?.TimeBlocks != null && newData.Planner?.TimeBlocks != null)
			{
				var oldMap = oldData.Planner.TimeBlocks.ToDictionary(b => b.Id);
				foreach (var newBlock in newData.Planner.TimeBlocks)
				{
					if (oldMap.TryGetValue(newBlock.Id, out var oldBlock))
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
				sb.AppendLine($"- ✏️ Modified Events: {modifiedBlocks}");
			}

			// 6. Todo Modification Check (New)
			int modifiedTodos = 0;
			if (oldData.Planner?.Items != null && newData.Planner?.Items != null)
			{
				var oldMap = oldData.Planner.Items.ToDictionary(i => i.Id);
				foreach (var newItem in newData.Planner.Items)
				{
					if (oldMap.TryGetValue(newItem.Id, out var oldItem))
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
				sb.AppendLine($"- ✏️ Modified Todos: {modifiedTodos}");
			}

			if (sb.Length < 40) // 제목만 있는 경우
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
			var oldList = oldData.Planner?.TimeBlocks ?? new List<TimeBlock>();
			var newList = newData.Planner?.TimeBlocks ?? new List<TimeBlock>();

			int countDiff = Math.Abs(newList.Count - oldList.Count);
			changes += countDiff;

			// 내용 변경 체크 (개수 차이와 별도로 수행)
			// 성능 최적화: Dictionary 빌드는 비용이 들지만 리스트가 크지 않다면 수용 가능.
			// 여기서는 루프를 돌며 ID 매칭을 시도.
			var oldMap = oldList.ToDictionary(b => b.Id);
			foreach (var newBlock in newList)
			{
				if (oldMap.TryGetValue(newBlock.Id, out var oldBlock))
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
			var oldTodos = oldData.Planner?.Items ?? new List<TodoItem>();
			var newTodos = newData.Planner?.Items ?? new List<TodoItem>();

			changes += Math.Abs(newTodos.Count - oldTodos.Count);

			var oldTodoMap = oldTodos.ToDictionary(i => i.Id);
			foreach (var newItem in newTodos)
			{
				if (oldTodoMap.TryGetValue(newItem.Id, out var oldItem))
				{
					if (oldItem.IsCompleted != newItem.IsCompleted ||
						oldItem.Content != newItem.Content)
					{
						// 완료 여부 변경이나 내용 변경 모두 1건의 변경으로 취급
						changes++;
					}
				}
			}

			// Planner SecretNotes (Count & Modification)
			var oldNotes = oldData.Planner?.SecretNotes ?? new List<SecretNote>();
			var newNotes = newData.Planner?.SecretNotes ?? new List<SecretNote>();
			changes += Math.Abs(newNotes.Count - oldNotes.Count);

			var oldNoteMap = oldNotes.ToDictionary(n => n.Id);
			foreach (var newNote in newNotes)
			{
				if (oldNoteMap.TryGetValue(newNote.Id, out var oldNote))
				{
					if (oldNote.Problem != newNote.Problem ||
						oldNote.Why != newNote.Why ||
						oldNote.Solution != newNote.Solution)
					{
						changes++;
					}
				}
			}

			// 중요 설정 변경은 1건이라도 있으면 즉시 true (threshold 무시)
			if (oldData.LifeWeekly?.BirthDate != newData.LifeWeekly?.BirthDate) return true;
			if (oldData.Theme != newData.Theme) return true;

			// Memo & Target Date
			if (oldData.Planner?.MemoContent != newData.Planner?.MemoContent) changes++;
			if (oldData.Planner?.TargetDateString != newData.Planner?.TargetDateString) changes++;

			return changes >= threshold;
		}
	}
}
