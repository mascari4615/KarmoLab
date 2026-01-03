using Discord;
using Discord.Interactions;
using System.Threading.Tasks;

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
			var embed = new EmbedBuilder()
				.WithTitle("📚 검 강화 봇 도움말")
				.WithDescription("`/`를 입력하여 명령어를 확인하세요!")
				.AddField("기본 명령어",
					"`/강화`: 검을 강화합니다.\n" +
					"`/판매`: 검을 판매합니다.\n" +
					"`/정보`: 내 정보를 확인합니다.\n" +
					"`/돈`: 내 돈을 확인합니다.\n" +
					"`/배틀`: 상대방과 대결합니다.\n" +
					"`/랭킹`: 랭킹을 확인합니다.\n" +
					"`/출첵`: 출석체크를 합니다.\n" +
					"`/민생지원금`: 지원금을 받습니다.")
				.WithColor(Color.Blue)
				.Build();

			await RespondAsync(embed: embed);
		}
	}
}
