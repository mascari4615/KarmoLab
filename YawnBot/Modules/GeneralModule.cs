using Discord;
using Discord.Interactions;
using Discord.WebSocket;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace YawnBot.Modules
{
	public class GeneralModule : InteractionModuleBase<SocketInteractionContext>
	{
		[SlashCommand("ping", "봇 생존 확인!")]
		public async Task PingAsync()
		{
			var embed = new EmbedBuilder()
				.WithTitle("🏓 Pong!")
				.WithDescription($"Latency: {Context.Client.Latency}ms")
				.WithColor(Color.Green)
				.Build();
			await RespondAsync(embed: embed);
		}

		[SlashCommand("도움말", "도움말을 출력합니다.")]
		public async Task HelpAsync()
		{
			await ShowHelpPageAsync(0);
		}

		[ComponentInteraction("help_page:*")]
		public async Task HandleHelpPageAsync(string pageIndexStr)
		{
			if (int.TryParse(pageIndexStr, out int pageIndex))
			{
				await ShowHelpPageAsync(pageIndex, true);
			}
		}

		private async Task ShowHelpPageAsync(int pageIndex, bool isUpdate = false)
		{
			var pages = GetHelpPages();
			if (pageIndex < 0) pageIndex = 0;
			if (pageIndex >= pages.Count) pageIndex = pages.Count - 1;

			var page = pages[pageIndex];
			var embed = new EmbedBuilder()
				.WithTitle($"📚 검 강화 봇 도움말 ({pageIndex + 1}/{pages.Count})")
				.WithDescription(page.Description)
				.AddField(page.Title, page.Content)
				.WithColor(Color.Blue)
				.Build();

			var components = new ComponentBuilder()
				.WithButton("이전", $"help_page:{pageIndex - 1}", ButtonStyle.Primary, disabled: pageIndex == 0)
				.WithButton("다음", $"help_page:{pageIndex + 1}", ButtonStyle.Primary, disabled: pageIndex == pages.Count - 1)
				.Build();

			if (isUpdate && Context.Interaction is SocketMessageComponent component)
			{
				await component.UpdateAsync(msg =>
				{
					msg.Embed = embed;
					msg.Components = components;
				});
			}
			else
			{
				await RespondAsync(embed: embed, components: components);
			}
		}

		private List<(string Title, string Description, string Content)> GetHelpPages()
		{
			return new List<(string, string, string)>
			{
				("기본 명령어", "기본적인 게임 진행을 위한 명령어입니다.",
					"`/강화`: 검을 강화합니다. (확률 존재)\n" +
					"`/판매`: 검을 판매하여 돈을 얻습니다.\n" +
					"`/정보`: 내 검과 재산 정보를 확인합니다.\n" +
					"`/돈`: 현재 보유한 돈을 확인합니다.\n" +
					"`/랭킹`: 전체 유저 랭킹을 확인합니다.\n" +
					"`/출첵`: 매일 출석체크 보상을 받습니다.\n" +
					"`/돈내놔`: 일정 시간마다 랜덤 용돈을 받습니다."),
				
				("미니게임", "돈을 걸고 즐길 수 있는 미니게임입니다.",
					"`/배틀 <상대>`: 다른 유저와 대결합니다. (하루 제한 있음)\n" +
					"`/슬롯 <금액>`: 슬롯 머신을 돌립니다. (잭팟을 노려보세요!)\n" +
					"`/홀짝 <홀/짝> <금액>`: 홀짝 게임을 합니다.\n" +
					"`/가위바위보 <선택> <금액>`: 가위바위보를 합니다."),

				("주식 시장", "주식 투자를 통해 자산을 불려보세요.",
					"`/주식목록`: 현재 상장된 주식 시세를 확인합니다.\n" +
					"`/주식차트 <종목>`: 해당 주식의 가격 변동 그래프를 봅니다.\n" +
					"`/매수 <종목> <수량>`: 주식을 매수합니다.\n" +
					"`/매도 <종목> <수량>`: 주식을 매도합니다.\n" +
					"`/내주식`: 내 주식 잔고를 확인합니다."),

				("레이드", "강력한 보스를 함께 처치하세요.",
					"`/레이드정보`: 현재 진행 중인 레이드 정보를 확인합니다.\n" +
					"`/공격`: 보스를 공격합니다. (쿨타임 존재)")
			};
		}
	}
}
