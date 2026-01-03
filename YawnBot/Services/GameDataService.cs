using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using YawnBot.Models;

namespace YawnBot.Services
{
	public class GameDataService
	{
		private const string GameDataPath = "Data/gamedata.json";
		private const string ProbabilitiesPath = "Data/probabilities.json";
		private const string ChatDataPath = "Data/chat.json";

		// Thread-safe collections
		public ConcurrentDictionary<ulong, SwordData> UserSwords { get; private set; } = new();
		public ConcurrentDictionary<ulong, int> UserMaxSwordLevels { get; private set; } = new();
		public ConcurrentDictionary<ulong, long> UserMoney { get; private set; } = new();
		public ConcurrentDictionary<ulong, DateTime> LastAttendance { get; private set; } = new();
		public ConcurrentDictionary<ulong, DailyBattleInfo> DailyBattleCounts { get; private set; } = new();
		public ConcurrentDictionary<ulong, bool> ReceivedSupportFundUsers { get; private set; } = new(); // HashSet -> ConcurrentDictionary (Key only)

		public List<UpgradeInfo> UpgradeInfos { get; private set; } = new();
		public Dictionary<string, ChatData> ChatData { get; private set; } = new();

		private readonly LoggingService _loggingService;
		private Timer _autoSaveTimer;
		private readonly object _saveLock = new();
		private readonly object _moneyLock = new();

		public GameDataService(LoggingService loggingService)
		{
			_loggingService = loggingService;
		}

		public bool TrySpendMoney(ulong userId, long amount)
		{
			lock (_moneyLock)
			{
				if (UserMoney.TryGetValue(userId, out long currentMoney))
				{
					if (currentMoney >= amount)
					{
						UserMoney[userId] = currentMoney - amount;
						return true;
					}
				}
				return false;
			}
		}

		public void AddMoney(ulong userId, long amount)
		{
			UserMoney.AddOrUpdate(userId, amount, (k, v) => v + amount);
		}

		public async Task InitializeAsync()
		{
			await LoadGameDataAsync();
			await LoadProbabilitiesAsync();
			await LoadChatDataAsync();
			StartAutoSave();
		}

		private void StartAutoSave()
		{
			_autoSaveTimer?.Dispose();
			// 1분마다 자동 저장
			_autoSaveTimer = new Timer(async _ => await SaveGameDataAsync(), null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));
		}

		public async Task SaveGameDataAsync()
		{
			try
			{
				if (!Directory.Exists("Data"))
				{
					Directory.CreateDirectory("Data");
				}

				var state = new GameState
				{
					UserSwords = UserSwords.ToDictionary(k => k.Key.ToString(), v => v.Value),
					UserMaxSwordLevels = UserMaxSwordLevels.ToDictionary(k => k.Key.ToString(), v => v.Value),
					UserMoney = UserMoney.ToDictionary(k => k.Key.ToString(), v => v.Value),
					LastAttendance = LastAttendance.ToDictionary(k => k.Key.ToString(), v => v.Value),
					DailyBattleCounts = DailyBattleCounts.ToDictionary(k => k.Key.ToString(), v => v.Value),
					ReceivedSupportFundUsers = ReceivedSupportFundUsers.Keys.Select(u => u.ToString()).ToList()
				};

				string json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
				await File.WriteAllTextAsync(GameDataPath, json);
				Console.WriteLine($"[AutoSave] 게임 데이터 저장 완료 ({DateTime.Now})");
			}
			catch (Exception ex)
			{
				await _loggingService.LogErrorAsync("GameDataService", "데이터 저장 실패", ex.Message);
			}
		}

		// 기존 동기 메서드 유지 (호환성 위해, 하지만 내부는 비동기 호출 권장)
		public void SaveGameData()
		{
			_ = SaveGameDataAsync();
		}

		private async Task LoadGameDataAsync()
		{
			if (File.Exists(GameDataPath))
			{
				try
				{
					string json = await File.ReadAllTextAsync(GameDataPath);
					var state = JsonSerializer.Deserialize<GameState>(json);
					if (state != null)
					{
						if (state.UserSwords != null)
							UserSwords = new ConcurrentDictionary<ulong, SwordData>(state.UserSwords.ToDictionary(k => ulong.Parse(k.Key), v => v.Value));

						if (state.UserMaxSwordLevels != null)
							UserMaxSwordLevels = new ConcurrentDictionary<ulong, int>(state.UserMaxSwordLevels.ToDictionary(k => ulong.Parse(k.Key), v => v.Value));

						if (state.UserMoney != null)
							UserMoney = new ConcurrentDictionary<ulong, long>(state.UserMoney.ToDictionary(k => ulong.Parse(k.Key), v => v.Value));

						if (state.LastAttendance != null)
							LastAttendance = new ConcurrentDictionary<ulong, DateTime>(state.LastAttendance.ToDictionary(k => ulong.Parse(k.Key), v => v.Value));

						if (state.DailyBattleCounts != null)
							DailyBattleCounts = new ConcurrentDictionary<ulong, DailyBattleInfo>(state.DailyBattleCounts.ToDictionary(k => ulong.Parse(k.Key), v => v.Value));

						if (state.ReceivedSupportFundUsers != null)
							ReceivedSupportFundUsers = new ConcurrentDictionary<ulong, bool>(state.ReceivedSupportFundUsers.Select(u => new KeyValuePair<ulong, bool>(ulong.Parse(u), true)));
					}
					Console.WriteLine("게임 데이터 로드 완료!");
				}
				catch (Exception ex)
				{
					await _loggingService.LogErrorAsync("GameDataService", "데이터 로드 실패", ex.Message);
				}
			}
		}

		private async Task LoadProbabilitiesAsync()
		{
			Console.WriteLine($"LoadProbabilities 호출됨. 경로: {Path.GetFullPath(ProbabilitiesPath)}");
			try
			{
				if (File.Exists(ProbabilitiesPath))
				{
					string jsonString = await File.ReadAllTextAsync(ProbabilitiesPath);
					UpgradeInfos = JsonSerializer.Deserialize<List<UpgradeInfo>>(jsonString) ?? new List<UpgradeInfo>();
					Console.WriteLine($"확률 정보 로드 완료: {UpgradeInfos.Count}개 항목");
				}
				else
				{
					await _loggingService.LogErrorAsync("GameDataService", "확률 정보 파일 없음", ProbabilitiesPath);
				}
			}
			catch (Exception ex)
			{
				await _loggingService.LogErrorAsync("GameDataService", "확률 정보 로드 실패", ex.Message);
			}
		}

		private async Task LoadChatDataAsync()
		{
			try
			{
				if (File.Exists(ChatDataPath))
				{
					string chatJson = await File.ReadAllTextAsync(ChatDataPath);
					ChatData = JsonSerializer.Deserialize<Dictionary<string, ChatData>>(chatJson) ?? new Dictionary<string, ChatData>();
				}
			}
			catch (Exception ex)
			{
				await _loggingService.LogErrorAsync("GameDataService", "대사 정보 로드 실패", ex.Message);
			}
		}
	}
}
