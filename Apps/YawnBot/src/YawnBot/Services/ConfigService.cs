using System;
using System.IO;
using System.Text.Json;
using System.Collections.Generic;
using System.Threading.Tasks;
using KarmoLab.YawnBot.Models;

namespace KarmoLab.YawnBot.Services
{
	public class ConfigService
	{
		private const string ConfigPath = "Data/config.json";
		private readonly LoggingService _loggingService;

		public ConfigService(LoggingService loggingService)
		{
			_loggingService = loggingService;
		}

		public BotConfig Config { get; private set; } = new();

		public async Task InitializeAsync()
		{
			if (File.Exists(ConfigPath))
			{
				try
				{
					string json = await File.ReadAllTextAsync(ConfigPath);
					Config = JsonSerializer.Deserialize<BotConfig>(json) ?? new BotConfig();
				}
				catch (Exception ex)
				{
					await _loggingService.LogErrorAsync("ConfigService", "설정 로드 실패", ex.Message);
				}
			}
			else
			{
				// 파일이 없으면 기본값으로 생성 (기존 하드코딩된 ID)
				Config.AdminIds.Add(391805564616704002);
				SaveConfig();
			}
		}

		public void SaveConfig()
		{
			try
			{
				if (!Directory.Exists("Data"))
				{
					Directory.CreateDirectory("Data");
				}
				string json = JsonSerializer.Serialize(Config, new JsonSerializerOptions { WriteIndented = true });
				File.WriteAllText(ConfigPath, json);
			}
			catch (Exception ex)
			{
				_ = _loggingService.LogErrorAsync("ConfigService", "설정 저장 실패", ex.Message);
			}
		}

		public bool IsAdmin(ulong userId) => Config.AdminIds.Contains(userId);
	}
}
