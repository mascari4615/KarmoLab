using Discord;
using Discord.Interactions;
using System.Threading.Tasks;
using KarmoLab.YawnBot.Services;
using KarmoLab.YawnBot.Models;

namespace KarmoLab.YawnBot.Modules
{
	[Group("admin", "관리자 전용 명령어")]
	public class AdminModule : InteractionModuleBase<SocketInteractionContext>
	{
		private readonly GameDataService _gameDataService;
		private readonly ConfigService _configService;

		public AdminModule(GameDataService gameDataService, ConfigService configService)
		{
			_gameDataService = gameDataService;
			_configService = configService;
		}

		[SlashCommand("리로드", "데이터를 다시 불러옵니다.")]
		public async Task ReloadAsync()
		{
			if (!_configService.IsAdmin(Context.User.Id))
			{
				Embed errorEmbed = new EmbedBuilder()
					.WithTitle(_gameDataService.GetMessage(BotMessageKey.Admin_AccessDenied_Title))
					.WithDescription(_gameDataService.GetMessage(BotMessageKey.Admin_AccessDenied_Desc))
					.WithColor(Color.Red)
					.Build();
				await RespondAsync(embed: errorEmbed, ephemeral: true);
				return;
			}

			await _gameDataService.InitializeAsync();
			await _configService.InitializeAsync();

			Embed successEmbed = new EmbedBuilder()
				.WithTitle(_gameDataService.GetMessage(BotMessageKey.Admin_Reload_Title))
				.WithDescription(_gameDataService.GetMessage(BotMessageKey.Admin_Reload_Desc))
				.WithColor(Color.Green)
				.Build();
			await RespondAsync(embed: successEmbed, ephemeral: true);
		}

		[SlashCommand("저장", "데이터를 저장합니다.")]
		public async Task SaveAsync()
		{
			if (!_configService.IsAdmin(Context.User.Id))
			{
				Embed errorEmbed = new EmbedBuilder()
					.WithTitle(_gameDataService.GetMessage(BotMessageKey.Admin_AccessDenied_Title))
					.WithDescription(_gameDataService.GetMessage(BotMessageKey.Admin_AccessDenied_Desc))
					.WithColor(Color.Red)
					.Build();
				await RespondAsync(embed: errorEmbed, ephemeral: true);
				return;
			}

			_gameDataService.SaveGameData();

			Embed successEmbed = new EmbedBuilder()
				.WithTitle(_gameDataService.GetMessage(BotMessageKey.Admin_Save_Title))
				.WithDescription(_gameDataService.GetMessage(BotMessageKey.Admin_Save_Desc))
				.WithColor(Color.Green)
				.Build();
			await RespondAsync(embed: successEmbed, ephemeral: true);
		}
	}
}
