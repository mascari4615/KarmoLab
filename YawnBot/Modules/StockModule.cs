using Discord;
using Discord.Interactions;
using System.Threading.Tasks;
using YawnBot.Services;

namespace YawnBot.Modules
{
	public class StockModule : InteractionModuleBase<SocketInteractionContext>
	{
		private readonly StockService _stockService;

		public StockModule(StockService stockService)
		{
			_stockService = stockService;
		}

		[SlashCommand("주식목록", "현재 주식 시세를 확인합니다.")]
		public async Task StockListAsync()
		{
			var embed = _stockService.GetStockListEmbed();
			await RespondAsync(embed: embed.Build());
		}

		[SlashCommand("매수", "주식을 매수합니다.")]
		public async Task BuyStockAsync(string symbol, int amount)
		{
			var (success, message) = _stockService.BuyStock(Context.User.Id, symbol.ToUpper(), amount);
			await RespondAsync(message, ephemeral: !success);
		}

		[SlashCommand("매도", "주식을 매도합니다.")]
		public async Task SellStockAsync(string symbol, int amount)
		{
			var (success, message) = _stockService.SellStock(Context.User.Id, symbol.ToUpper(), amount);
			await RespondAsync(message, ephemeral: !success);
		}

		[SlashCommand("내주식", "내 주식 잔고를 확인합니다.")]
		public async Task MyStockAsync()
		{
			var embed = _stockService.GetMyStockEmbed(Context.User.Id, Context.User.Username);
			await RespondAsync(embed: embed.Build());
		}
	}
}
