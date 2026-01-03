using Discord;
using Discord.Interactions;
using System.Threading.Tasks;
using YawnBot.Services;

namespace YawnBot.Modules
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
				var errorEmbed = new EmbedBuilder()
					.WithTitle("🚫 접근 거부")
					.WithDescription("관리자만 사용할 수 있는 명령어입니다.")
					.WithColor(Color.Red)
					.Build();
				await RespondAsync(embed: errorEmbed, ephemeral: true);
				return;
			}

			await _gameDataService.InitializeAsync();
			await _configService.InitializeAsync();
			
			var successEmbed = new EmbedBuilder()
				.WithTitle("✅ 리로드 완료")
				.WithDescription("데이터 및 설정을 다시 불러왔습니다.")
				.WithColor(Color.Green)
				.Build();
			await RespondAsync(embed: successEmbed, ephemeral: true);
		}

		[SlashCommand("저장", "데이터를 저장합니다.")]
		public async Task SaveAsync()
		{
			if (!_configService.IsAdmin(Context.User.Id))
			{
				var errorEmbed = new EmbedBuilder()
					.WithTitle("🚫 접근 거부")
					.WithDescription("관리자만 사용할 수 있는 명령어입니다.")
					.WithColor(Color.Red)
					.Build();
				await RespondAsync(embed: errorEmbed, ephemeral: true);
				return;
			}

			_gameDataService.SaveGameData();
			
			var successEmbed = new EmbedBuilder()
				.WithTitle("💾 저장 완료")
				.WithDescription("게임 데이터를 저장했습니다.")
				.WithColor(Color.Green)
				.Build();
			await RespondAsync(embed: successEmbed, ephemeral: true);
		}
	}
}
