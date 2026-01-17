using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using KarmoLab.YawnBot.Models;

namespace KarmoLab.YawnBot.Services
{
	public class GameDataService
	{
		private const string GameDataPath = "Data/gamedata.json";
		private const string ProbabilitiesPath = "Data/probabilities.json";
		private const string ChatDataPath = "Data/chat.json";
		private const string BotMessagesPath = "Data/bot_messages.json";

		// Thread-safe collections
		public ConcurrentDictionary<ulong, SwordData> UserSwords { get; private set; } = new();
		public ConcurrentDictionary<ulong, int> UserMaxSwordLevels { get; private set; } = new();
		public ConcurrentDictionary<ulong, long> UserMoney { get; private set; } = new();
		public ConcurrentDictionary<ulong, DateTime> LastAttendance { get; private set; } = new();
		public ConcurrentDictionary<ulong, DailyBattleInfo> DailyBattleCounts { get; private set; } = new();
		public ConcurrentDictionary<ulong, UserStockData> UserStocks { get; private set; } = new();
		public ConcurrentDictionary<string, StockItem> Stocks { get; private set; } = new();

		public List<UpgradeInfo> UpgradeInfos { get; private set; } = new();
		public Dictionary<string, ChatData> ChatData { get; private set; } = new();
		public Dictionary<BotMessageKey, string> BotMessages { get; private set; } = new();
		public Dictionary<string, WeaponLoreData> WeaponLores { get; private set; } = new(); // 무기 종류별 Lore 데이터

		private readonly LoggingService _loggingService;
		private Timer? _autoSaveTimer;
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
			await LoadBotMessagesAsync();
			await LoadWeaponLoresAsync();
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

				GameState state = new GameState
				{
					UserSwords = UserSwords.ToDictionary(k => k.Key.ToString(), v => v.Value),
					UserMaxSwordLevels = UserMaxSwordLevels.ToDictionary(k => k.Key.ToString(), v => v.Value),
					UserMoney = UserMoney.ToDictionary(k => k.Key.ToString(), v => v.Value),
					LastAttendance = LastAttendance.ToDictionary(k => k.Key.ToString(), v => v.Value),
					DailyBattleCounts = DailyBattleCounts.ToDictionary(k => k.Key.ToString(), v => v.Value),
					UserStocks = UserStocks.ToDictionary(k => k.Key.ToString(), v => v.Value),
					Stocks = Stocks.ToDictionary(k => k.Key, v => v.Value)
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
					GameState? state = JsonSerializer.Deserialize<GameState>(json);
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

						if (state.UserStocks != null)
							UserStocks = new ConcurrentDictionary<ulong, UserStockData>(state.UserStocks.ToDictionary(k => ulong.Parse(k.Key), v => v.Value));

						if (state.Stocks != null)
							Stocks = new ConcurrentDictionary<string, StockItem>(state.Stocks);
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
		private async Task LoadWeaponLoresAsync()
		{
			try
			{
				string enhancementPath = "Resources/img/enhancement";
				if (Directory.Exists(enhancementPath))
				{
					string[] files = Directory.GetFiles(enhancementPath, "*_data.json", SearchOption.AllDirectories);
					foreach (string file in files)
					{
						string jsonString = await File.ReadAllTextAsync(file);
						// JSON 구조가 대소문자 구분 없이 매핑되도록 옵션 설정
						JsonSerializerOptions options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
						WeaponLoreData? loreData = JsonSerializer.Deserialize<WeaponLoreData>(jsonString, options);

						if (loreData != null && !string.IsNullOrEmpty(loreData.WeaponName))
						{
							WeaponLores[loreData.WeaponName] = loreData;
						}
					}
					Console.WriteLine($"무기 Lore 데이터 로드 완료: {WeaponLores.Count}개 무기");
				}
			}
			catch (Exception ex)
			{
				await _loggingService.LogErrorAsync("GameDataService", "무기 Lore 데이터 로드 실패", ex.Message);
			}
		}

		private async Task LoadBotMessagesAsync()
		{
			try
			{
				if (File.Exists(BotMessagesPath))
				{
					string json = await File.ReadAllTextAsync(BotMessagesPath);
					var rawMessages = JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new Dictionary<string, string>();

					BotMessages.Clear();
					foreach (var kvp in rawMessages)
					{
						if (Enum.TryParse(kvp.Key, out BotMessageKey key))
						{
							BotMessages[key] = kvp.Value;
						}
						else
						{
							Console.WriteLine($"[Warning] Unknown message key: {kvp.Key}");
						}
					}
				}
			}
			catch (Exception ex)
			{
				await _loggingService.LogErrorAsync("GameDataService", "봇 메시지 로드 실패", ex.Message);
			}
		}

		public string GetMessage(BotMessageKey key, params object[] args)
		{
			if (BotMessages.TryGetValue(key, out string? value))
			{
				try
				{
					return string.Format(value, args);
				}
				catch
				{
					return value;
				}
			}
			return key.ToString();
		}
	}
}
