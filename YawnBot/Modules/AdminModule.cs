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
				await RespondAsync("🚫 **관리자만 사용할 수 있는 명령어입니다.**", ephemeral: true);
				return;
			}

			await _gameDataService.InitializeAsync();
			await _configService.InitializeAsync();
			await RespondAsync("✅ **데이터 및 설정 리로드 완료!**", ephemeral: true);
		}

		[SlashCommand("저장", "데이터를 저장합니다.")]
		public async Task SaveAsync()
		{
			if (!_configService.IsAdmin(Context.User.Id))
			{
				await RespondAsync("🚫 **관리자만 사용할 수 있는 명령어입니다.**", ephemeral: true);
				return;
			}

			_gameDataService.SaveGameData();
			await RespondAsync("💾 **데이터 저장 완료!**", ephemeral: true);
		}
	}
}
