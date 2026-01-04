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

		[ComponentInteraction("enhance_retry")]
		public async Task EnhanceRetryAsync()
		{
			await DeferAsync();
			await _enhancementService.EnhanceSwordAsync(Context.User, Context.Channel);
		}

		[ComponentInteraction("sell_sword")]
		public async Task SellSwordButtonAsync()
		{
			await DeferAsync();
			await _enhancementService.SellSwordAsync(Context.User, Context.Channel);
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

		[SlashCommand("돈내놔", "랜덤으로 돈을 뺏습니다.")]
		public async Task GiveMeMoneyAsync()
		{
			await DeferAsync();
			await _enhancementService.GiveMeMoneyAsync(Context.User, Context.Channel);
			await DeleteOriginalResponseAsync();
		}

		[SlashCommand("슬롯", "슬롯 머신을 돌립니다.")]
		public async Task SlotAsync([Summary("배팅금액")] long bet)
		{
			await RespondAsync("🎰 슬롯 머신을 가동합니다!", ephemeral: true);
			_ = _enhancementService.SlotAsync(Context.User, Context.Channel, bet);
		}

		[SlashCommand("홀짝", "홀짝 게임을 합니다.")]
		public async Task OddEvenAsync([Summary("선택", "홀 또는 짝")] string choice, [Summary("배팅금액")] long bet)
		{
			if (choice != "홀" && choice != "짝")
			{
				await RespondAsync("홀 또는 짝만 선택 가능합니다.", ephemeral: true);
				return;
			}
			await DeferAsync();
			await _enhancementService.OddEvenAsync(Context.User, Context.Channel, choice, bet);
			await DeleteOriginalResponseAsync();
		}

		[SlashCommand("가위바위보", "가위바위보 게임을 합니다.")]
		public async Task RpsAsync([Summary("선택", "가위, 바위, 보 중 하나")] string choice, [Summary("배팅금액")] long bet)
		{
			if (choice != "가위" && choice != "바위" && choice != "보")
			{
				await RespondAsync("가위, 바위, 보 중 하나만 선택 가능합니다.", ephemeral: true);
				return;
			}
			await DeferAsync();
			await _enhancementService.RpsAsync(Context.User, Context.Channel, choice, bet);
			await DeleteOriginalResponseAsync();
		}
	}
}
