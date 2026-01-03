using Discord;
using Discord.Interactions;
using Discord.WebSocket;
using Microsoft.Extensions.DependencyInjection;
using System.Reflection;
using YawnBot.Services;
using dotenv.net;

namespace YawnBot
{
	public class Program
	{
		private DiscordSocketClient _client;
		private InteractionService _interactionService;
		private IServiceProvider _services;

		public static Task Main(string[] args) => new Program().MainAsync();

		public async Task MainAsync()
		{
			Directory.SetCurrentDirectory(AppContext.BaseDirectory);
			DotEnv.Load();

			var config = new DiscordSocketConfig
			{
				GatewayIntents = GatewayIntents.AllUnprivileged | GatewayIntents.MessageContent
			};

			_services = new ServiceCollection()
				.AddSingleton(config)
				.AddSingleton<DiscordSocketClient>()
				.AddSingleton(x => new InteractionService(x.GetRequiredService<DiscordSocketClient>()))
				.AddSingleton<LoggingService>()
				.AddSingleton<ConfigService>()
				.AddSingleton<GameDataService>()
				.AddSingleton<EnhancementService>()
				.AddSingleton<Random>()
				.BuildServiceProvider();

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

			var token = Environment.GetEnvironmentVariable("DISCORD_TOKEN");

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

			await Task.Delay(-1);
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
				foreach (var guild in _client.Guilds)
				{
					await _interactionService.RegisterCommandsToGuildAsync(guild.Id);
					Console.WriteLine($"{guild.Name} ({guild.Id})에 명령어 등록 완료");
				}
				// await _interactionService.RegisterCommandsGloballyAsync(); // 배포 시 사용
				Console.WriteLine("슬래시 커맨드 등록 완료!");
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
				var ctx = new SocketInteractionContext(_client, interaction);
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

			if (await MemeService.HandleMemeAsync(message))
			{
				return;
			}
		}

		private async Task ButtonExecutedAsync(SocketMessageComponent component)
		{
			if (component.Data.CustomId == "consolation")
			{
				var enhancementService = _services.GetRequiredService<EnhancementService>();
				string imageName = enhancementService.GetRandomImage("bot_asset_위로(놀림)_");
				string imagePath = imageName != null ? Path.Combine("Resources/img/sword", imageName) : null;
				
				var embed = new EmbedBuilder()
					.WithTitle("🤣 위로(또는 놀림) 도착!")
					.WithDescription($"{component.User.Mention}님이 위로(또는 놀림)를 건넸습니다! ㅋㅋㅋ")
					.WithColor(Color.Magenta);

				await enhancementService.SendEmbedAsync(component.Channel, embed, imagePath);

				await component.DeferAsync();
			}
		}
	}
}
