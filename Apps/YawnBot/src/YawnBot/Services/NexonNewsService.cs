using Discord;
using Discord.WebSocket;
using KarmoAI.Interfaces;
using KarmoAI.Models;
using Microsoft.Extensions.Configuration;
using System.Text.Json;

namespace KarmoLab.YawnBot.Services
{
	public class NexonNewsService
	{
		private readonly IAIService _aiService;
		private readonly DiscordSocketClient _client;
		private readonly IConfiguration _configuration;
		private readonly LoggingService _logging;

		public NexonNewsService(
			IAIService aiService, 
			DiscordSocketClient client, 
			IConfiguration configuration,
			LoggingService logging)
		{
			_aiService = aiService;
			_client = client;
			_configuration = configuration;
			_logging = logging;
		}

		public async Task FetchAndPostSummaryAsync(ulong channelId)
		{
			try
			{
				// 실제 구현에서는 넥슨 기술 블로그나 공지사항 RSS/API를 크롤링해야 함.
				// 여기서는 데모를 위해 가상의 뉴스 데이터를 정의함.
				string dummyNewsData = @"
					1. 넥슨, 신작 '카트라이더: 드리프트' 글로벌 시즌 2 업데이트 실시. 신규 트랙 및 캐릭터 추가.
					2. '던전앤파이터 모바일', 신규 레이드 '오즈마' 업데이트 예고 및 사전 이벤트 진행.
					3. 넥슨재단, 어린이 의료 지원을 위한 기부금 10억원 전달.
					4. '메이플스토리', 여름 대규모 업데이트 'SAVIOR' 쇼케이스 개최 예정.
				";

				string systemInstruction = "당신은 게임 뉴스 전문 에디터입니다. 주어진 정보를 바탕으로 핵심 내용을 요약하여 전달하세요. 전문적이고 간결한 어조를 사용하세요.";
				string prompt = $"다음 넥슨 뉴스 데이터를 분석하여 중요도 순으로 3줄 요약해주세요:\n\n{dummyNewsData}";
				
				string summary = await _aiService.GetResponseAsync(prompt, systemInstruction);

				if (string.IsNullOrWhiteSpace(summary))
				{
					Console.WriteLine("[NexonNews] 요약 데이터가 비어 있습니다.");
					return;
				}

				if (_client.GetChannel(channelId) is SocketTextChannel channel)
				{
					EmbedBuilder embed = new EmbedBuilder()
						.WithTitle("📢 Nexon News Weekly Summary")
						.WithDescription(summary)
						.WithColor(Color.Orange)
						.WithThumbnailUrl("https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Nexon_logo.svg/1024px-Nexon_logo.svg.png")
						.WithFooter(footer => footer.Text = "Summarized by KarmoAI (Gemini)")
						.WithTimestamp(DateTimeOffset.Now);

					await channel.SendMessageAsync(embed: embed.Build());
				}
			}
			catch (Exception ex)
			{
				await _logging.LogErrorAsync("NexonNews", "뉴스 요약 게시 중 오류 발생", ex.Message);
			}
		}
	}
}
