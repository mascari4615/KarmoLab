using System.Text.Json;

namespace YawnBot.Services
{
	public class LoggingService
	{
		private const string LogPath = "Data/error_logs.json";
		private readonly JsonSerializerOptions _jsonOptions = new() { WriteIndented = true };

		public async Task LogErrorAsync(string source, string message, object data = null)
		{
			var logEntry = new
			{
				Timestamp = DateTime.Now,
				Source = source,
				Message = message,
				Data = data
			};

			List<object> logs = [];

			try
			{
				if (File.Exists(LogPath))
				{
					string content = await File.ReadAllTextAsync(LogPath);
					if (!string.IsNullOrWhiteSpace(content))
					{
						logs = JsonSerializer.Deserialize<List<object>>(content) ?? [];
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
