using Discord;
using Discord.Interactions;
using KarmoAI.Interfaces;

namespace KarmoLab.YawnBot.Modules
{
	public class GeminiModule : InteractionModuleBase<SocketInteractionContext>
	{
		private readonly IAIService _aiService;

		public GeminiModule(IAIService aiService)
		{
			_aiService = aiService;
		}

		[SlashCommand("yawn", "Gemini AI에게 무엇이든 물어보세요!")]
		public async Task YawnAsync([Summary("질문", "AI에게 전달할 메시지")] string prompt)
		{
			await DeferAsync();

			try
			{
				string systemInstruction = "너는 'YawnBot'이라는 이름의 활기차고 재치 있는 디스코드 봇이야. 사용자의 질문에 친절하고 유머러스하게 대답해줘.";
				string response = await _aiService.GetResponseAsync(prompt, systemInstruction);

				if (string.IsNullOrWhiteSpace(response))
				{
					await FollowupAsync("AI로부터 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.");
					return;
				}

				EmbedBuilder embed = new EmbedBuilder()
					.WithTitle("YawnBot AI Response")
					.WithDescription(response)
					.WithColor(Color.Blue)
					.WithFooter(footer => footer.Text = "Powered by Google Gemini")
					.WithTimestamp(DateTimeOffset.Now);

				await FollowupAsync(embed: embed.Build());
			}
			catch (Exception ex)
			{
				await FollowupAsync($"오류가 발생했습니다: {ex.Message}");
			}
		}
	}
}
