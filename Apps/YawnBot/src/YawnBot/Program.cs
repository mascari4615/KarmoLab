using Discord;
using Discord.Interactions;
using Discord.WebSocket;
using Microsoft.Extensions.DependencyInjection;
using System.Reflection;
using KarmoLab.YawnBot.Services;
using KarmoLab.YawnBot.Models;
using dotenv.net;

namespace KarmoLab.YawnBot
{
	public class Program
	{
		private DiscordSocketClient _client = null!;
		private InteractionService _interactionService = null!;
		private IServiceProvider _services = null!;

		public static Task Main(string[] args) => new Program().MainAsync();

		public async Task MainAsync()
		{
			Directory.SetCurrentDirectory(AppContext.BaseDirectory);
			DotEnv.Load();

			DiscordSocketConfig config = new DiscordSocketConfig
			{
				GatewayIntents = GatewayIntents.AllUnprivileged | GatewayIntents.MessageContent
			};

			WebApplicationBuilder builder = WebApplication.CreateBuilder();

			// DI 설정
			builder.Services.AddSingleton(config);
			builder.Services.AddSingleton<DiscordSocketClient>();
			builder.Services.AddSingleton(x => new InteractionService(x.GetRequiredService<DiscordSocketClient>()));
			builder.Services.AddSingleton<LoggingService>();
			builder.Services.AddSingleton<ConfigService>();
			builder.Services.AddSingleton<GameDataService>();
			builder.Services.AddSingleton<EnhancementService>();
			builder.Services.AddSingleton<RaidService>();
			builder.Services.AddSingleton<StockService>();
			builder.Services.AddSingleton<Random>();

			WebApplication app = builder.Build();
			_services = app.Services;

			_client = _services.GetRequiredService<DiscordSocketClient>();
			_interactionService = _services.GetRequiredService<InteractionService>();

			await _services.GetRequiredService<ConfigService>().InitializeAsync();
			await _services.GetRequiredService<GameDataService>().InitializeAsync();

			_client.Log += Log;
			_interactionService.Log += Log;
			_client.Ready += ReadyAsync;
			_client.MessageReceived += MessageReceivedAsync;
			_client.ButtonExecuted += ButtonExecutedAsync;
			_client.InteractionCreated += HandleInteraction;

			// 웹훅 엔드포인트 설정 (Extracted to WebhookService)
			app.MapPost("/webhook/github", WebhookService.ProcessGitHubWebhookAsync);

			string? token = Environment.GetEnvironmentVariable("DISCORD_TOKEN");

			if (string.IsNullOrWhiteSpace(token))
			{
				Console.WriteLine("봇 토큰을 입력하세요:");
				token = Console.ReadLine();
			}

			if (string.IsNullOrWhiteSpace(token))
			{
				Console.WriteLine("토큰이 입력되지 않았습니다. 프로그램을 종료합니다.");
				return;
			}

			await _client.LoginAsync(TokenType.Bot, token);
			await _client.StartAsync();

			await app.RunAsync();
		}

		private Task Log(LogMessage msg)
		{
			Console.WriteLine(msg.ToString());
			return Task.CompletedTask;
		}

		private async Task ReadyAsync()
		{
			await _client.SetGameAsync("/강화", type: ActivityType.Playing);
			Console.WriteLine($"{_client.CurrentUser} 연결됨!");

			try
			{
				// 기존에 등록된 글로벌 커맨드가 있다면 삭제 (중복 방지)
				if (_client.Rest != null)
				{
					await _client.Rest.DeleteAllGlobalCommandsAsync();
				}

				await _interactionService.AddModulesAsync(Assembly.GetEntryAssembly(), _services);

				// 개발 중에는 모든 길드에 직접 등록 (즉시 반영)
				foreach (SocketGuild guild in _client.Guilds)
				{
					await _interactionService.RegisterCommandsToGuildAsync(guild.Id);
					Console.WriteLine($"{guild.Name} ({guild.Id})에 명령어 등록 완료");
				}
				// await _interactionService.RegisterCommandsGloballyAsync(); // 배포 시 사용
				Console.WriteLine("슬래시 커맨드 등록 완료!");

				// 서버 시작 알림 (Webhook Channel)
				string? webhookChannelIdStr = Environment.GetEnvironmentVariable("GITHUB_WEBHOOK_CHANNEL_ID");
				if (ulong.TryParse(webhookChannelIdStr, out ulong webhookChannelId))
				{
					if (_client.GetChannel(webhookChannelId) is SocketTextChannel channel)
					{
						GameDataService gameData = _services.GetRequiredService<GameDataService>();
						string version = Assembly.GetEntryAssembly()?.GetName()?.Version?.ToString() ?? "Unknown";
						string greeting = gameData.GetMessage(BotMessageKey.Server_Startup_Greeting, version);
						await channel.SendMessageAsync(greeting);
					}
				}
			}
			catch (Exception ex)
			{
				Console.WriteLine($"슬래시 커맨드 등록 실패: {ex.Message}");
			}
		}

		private async Task HandleInteraction(SocketInteraction interaction)
		{
			try
			{
				SocketInteractionContext ctx = new SocketInteractionContext(_client, interaction);
				await _interactionService.ExecuteCommandAsync(ctx, _services);
			}
			catch (Exception ex)
			{
				Console.WriteLine(ex);
			}
		}

		private async Task MessageReceivedAsync(SocketMessage message)
		{
			if (message.Author.Id == _client.CurrentUser.Id) return;

			if (await MemeService.HandleMemeAsync(message, _services.GetRequiredService<GameDataService>()))
			{
				return;
			}
		}

		private async Task ButtonExecutedAsync(SocketMessageComponent component)
		{
			if (component.Data.CustomId == "consolation")
			{
				EnhancementService enhancementService = _services.GetRequiredService<EnhancementService>();
				GameDataService gameData = _services.GetRequiredService<GameDataService>();
				string? imageName = enhancementService.GetRandomImage("위로(놀림)_");
				string? imagePath = imageName != null ? Path.Combine("Resources/img/enhancement", imageName) : null;

				EmbedBuilder embed = new EmbedBuilder()
					.WithTitle(gameData.GetMessage(BotMessageKey.Consolation_Title))
					.WithDescription(gameData.GetMessage(BotMessageKey.Consolation_Desc, component.User.Mention))
					.WithColor(Color.Magenta);

				await enhancementService.SendEmbedAsync(component.Channel, embed, imagePath);

				await component.DeferAsync();
			}
		}
	}
}
