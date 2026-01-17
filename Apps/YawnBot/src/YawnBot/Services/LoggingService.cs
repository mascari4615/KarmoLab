using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace KarmoLab.YawnBot.Services
{
	public struct LogEntry
	{
		public DateTime Timestamp { get; set; }
		public string Source { get; set; }
		public string Message { get; set; }
		public object? Data { get; set; }
	}

	public class LoggingService
	{
		private const string LogPath = "Data/error_logs.json";
		private readonly JsonSerializerOptions _jsonOptions = new() { WriteIndented = true };

		public async Task LogErrorAsync(string source, string message, object? data = null)
		{
			LogEntry logEntry = new LogEntry
			{
				Timestamp = DateTime.Now,
				Source = source,
				Message = message,
				Data = data
			};

			List<object> logs = new List<object>();

			try
			{
				if (File.Exists(LogPath))
				{
					string content = await File.ReadAllTextAsync(LogPath);
					if (!string.IsNullOrWhiteSpace(content))
					{
						logs = JsonSerializer.Deserialize<List<object>>(content) ?? new List<object>();
					}
				}

				logs.Add(logEntry);

				if (!Directory.Exists("Data"))
				{
					Directory.CreateDirectory("Data");
				}

				await File.WriteAllTextAsync(LogPath, JsonSerializer.Serialize(logs, _jsonOptions));
				Console.WriteLine($"[Error Logged] {source}: {message}");
			}
			catch (Exception ex)
			{
				Console.WriteLine($"Failed to log error: {ex.Message}");
			}
		}
	}
}
