using Discord;
using Discord.WebSocket;
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using KarmoLab.YawnBot.Models;

namespace KarmoLab.YawnBot.Services
{
	public class MemeService
	{
		private const string MemePath = "Resources/img/meme";

		public static async Task<bool> HandleMemeAsync(SocketMessage message, GameDataService gameData)
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
				char[] invalidChars = Path.GetInvalidFileNameChars();
				if (query.IndexOfAny(invalidChars) < 0)
				{
					// 대소문자 구분 없이 매칭 (폴더 내 모든 파일을 확인하여 비교)
					DirectoryInfo dir = new DirectoryInfo(MemePath);
					FileInfo[] files = dir.GetFiles();
					FileInfo? targetFile = files.FirstOrDefault(f => Path.GetFileNameWithoutExtension(f.Name).Equals(query, StringComparison.CurrentCultureIgnoreCase));

					if (targetFile != null)
					{
						string fileName = Path.GetFileName(targetFile.FullName);
						Embed embed = new EmbedBuilder()
							.WithTitle(gameData.GetMessage(BotMessageKey.Meme_Title, query))
							.WithImageUrl($"attachment://{fileName}")
							.WithColor(Color.Gold)
							.WithFooter(gameData.GetMessage(BotMessageKey.Meme_Footer, message.Author.Username), message.Author.GetAvatarUrl() ?? message.Author.GetDefaultAvatarUrl())
							.Build();

						await message.Channel.SendFileAsync(targetFile.FullName, embed: embed);
						return true;
					}
				}
			}
			catch { }
			return false;
		}
	}
}
