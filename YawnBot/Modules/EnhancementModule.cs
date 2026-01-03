using Discord;
using Discord.Interactions;
using Discord.WebSocket;
using System.Threading.Tasks;
using YawnBot.Services;

namespace YawnBot.Modules
{
	public class EnhancementModule : InteractionModuleBase<SocketInteractionContext>
	{
		private readonly EnhancementService _enhancementService;
		private readonly DiscordSocketClient _client;

		public EnhancementModule(EnhancementService enhancementService, DiscordSocketClient client)
		{
			_enhancementService = enhancementService;
			_client = client;
		}

		[SlashCommand("강화", "검을 강화합니다.")]
		public async Task EnhanceAsync()
		{
			await DeferAsync();
			await _enhancementService.EnhanceSwordAsync(Context.User, Context.Channel);
			await DeleteOriginalResponseAsync();
		}

		[SlashCommand("판매", "검을 판매합니다.")]
		public async Task SellAsync()
		{
			await DeferAsync();
			await _enhancementService.SellSwordAsync(Context.User, Context.Channel);
			await DeleteOriginalResponseAsync();
		}

		[SlashCommand("정보", "내 정보를 확인합니다.")]
		public async Task InfoAsync()
		{
			await DeferAsync();
			await _enhancementService.ShowInfoAsync(Context.User, Context.Channel);
			await DeleteOriginalResponseAsync();
		}

		[SlashCommand("돈", "내 돈을 확인합니다.")]
		public async Task MoneyAsync()
		{
			await DeferAsync();
			await _enhancementService.ShowMoneyAsync(Context.User, Context.Channel);
			await DeleteOriginalResponseAsync();
		}

		[SlashCommand("배틀", "상대방과 대결합니다.")]
		public async Task BattleAsync(IUser target)
		{
			await DeferAsync();
			await _enhancementService.BattleAsync(Context.User, target, Context.Channel);
			await DeleteOriginalResponseAsync();
		}

		[SlashCommand("랭킹", "랭킹을 확인합니다.")]
		public async Task RankingAsync()
		{
			await DeferAsync();
			await _enhancementService.ShowRankingAsync(Context.Channel, _client);
			await DeleteOriginalResponseAsync();
		}

		[SlashCommand("출첵", "출석체크를 합니다.")]
		public async Task CheckAttendanceAsync()
		{
			await DeferAsync();
			await _enhancementService.CheckAttendanceAsync(Context.User, Context.Channel);
			await DeleteOriginalResponseAsync();
		}

		[SlashCommand("민생지원금", "지원금을 받습니다.")]
		public async Task SupportFundAsync()
		{
			await DeferAsync();
			await _enhancementService.GiveSupportFundAsync(Context.User, Context.Channel);
			await DeleteOriginalResponseAsync();
		}
	}
}
