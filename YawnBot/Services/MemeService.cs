using Discord.WebSocket;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace YawnBot.Services
{
	public class MemeService
	{
		private const string MemePath = "Resources/img/meme";

		public static async Task<bool> HandleMemeAsync(SocketMessage message)
		{
			// 명령어(!)로 시작하면 무시
			if (message.Content.StartsWith("!")) return false;

			string query = message.Content.Trim().ToLower();
			Console.WriteLine($"MemeService: Received query '{query}'");
			if (string.IsNullOrEmpty(query)) return false;

			try
			{
				if (!Directory.Exists(MemePath))
				{
					Directory.CreateDirectory(MemePath);
				}

				// 파일명 유효성 검사
				var invalidChars = Path.GetInvalidFileNameChars();
				if (query.IndexOfAny(invalidChars) < 0)
				{
					// 대소문자 구분 없이 매칭 (폴더 내 모든 파일을 확인하여 비교)
					var dir = new DirectoryInfo(MemePath);
					var files = dir.GetFiles();
					var targetFile = files.FirstOrDefault(f => Path.GetFileNameWithoutExtension(f.Name).Equals(query, StringComparison.CurrentCultureIgnoreCase));

					if (targetFile != null)
					{
						await message.Channel.SendFileAsync(targetFile.FullName);
						return true;
					}
				}
			}
			catch { }
			return false;
		}
	}
}
