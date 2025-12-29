// using System;
// using System.Text.RegularExpressions;
// using System.Threading.Tasks;
// using Discord;
// using Discord.Commands;
// using Discord.WebSocket;
// using HtmlAgilityPack;

// namespace PwdDelDDa
// {
// 	class Program
// 	{
// 		private DiscordSocketClient? _client;
// 		private CommandService? _commands;
// 		private Timer _timer;

// 		static void Main(string[] args) => new Program().RunBotAsync().GetAwaiter().GetResult();

// 		public async Task RunBotAsync()
// 		{
// 			_client = new DiscordSocketClient(new DiscordSocketConfig()
// 			{
// 				GatewayIntents = GatewayIntents.AllUnprivileged | GatewayIntents.MessageContent,
// 				LogLevel = LogSeverity.Verbose
// 			});
// 			_commands = new CommandService(new CommandServiceConfig()
// 			{
// 				LogLevel = LogSeverity.Verbose
// 			});

// 			_client.Log += OnClientLogReceived;
// 			_commands.Log += OnClientLogReceived;

// 			string token = "";
// 			await _client.LoginAsync(TokenType.Bot, token);
// 			await _client.StartAsync();

// 			_client.MessageReceived += MessageReceivedAsync;

// 			TimeSpan dueTime = GetNextRunTime();
// 			TimeSpan period = TimeSpan.FromDays(1);
// 			_timer = new Timer(CheckForNewCoupon, null, dueTime, period);

// 			await Task.Delay(-1);   //봇이 종료되지 않도록 블로킹
// 		}

// 		private async Task MessageReceivedAsync(SocketMessage arg)
// 		{
// 			// Console.WriteLine("메시지 수신됨 - " + arg.Author.Username + " : " + arg.Content);

// 			SocketUserMessage? message = arg as SocketUserMessage;
// 			if (message == null)
// 				return;

// 			// Console.WriteLine("메시지 수신됨 - " + message.Author.Username + " : " + message.Content);
// 			// Console.WriteLine(message.Content.Length);

// 			if (message.Author.Username == "")
// 			{
// 				return;
// 				SocketCommandContext context_ = new(_client, message);                    //수신된 메시지에 대한 컨텍스트 생성   
// 				await context_.Channel.SendMessageAsync(""); //수신된 명령어를 다시 보낸다.
// 				return;
// 			}

// 			int pos = 0;

// 			//메시지 앞에 !이 달려있지 않고, 자신이 호출된게 아니거나 다른 봇이 호출했다면 취소
// 			if (!(message.HasCharPrefix('!', ref pos) ||
// 			 message.HasMentionPrefix(_client.CurrentUser, ref pos)) ||
// 			  message.Author.IsBot)
// 				return;

// 			SocketCommandContext context = new(_client, message);                    //수신된 메시지에 대한 컨텍스트 생성   

// 			await context.Channel.SendMessageAsync("명령어 수신됨 - " + message.Content); //수신된 명령어를 다시 보낸다.
// 		}

// 		/// <summary>
// 		/// 봇의 로그를 출력하는 함수
// 		/// </summary>
// 		/// <param name="msg">봇의 클라이언트에서 수신된 로그</param>
// 		/// <returns></returns>
// 		private Task OnClientLogReceived(LogMessage msg)
// 		{
// 			Console.WriteLine(msg.ToString());  //로그 출력
// 			return Task.CompletedTask;
// 		}

// 		private static TimeSpan GetNextRunTime()
// 		{
// 			// 하루마다
// 			DateTime now = DateTime.Now;
// 			DateTime nextRun = now.Date.AddDays(1);
// 			return nextRun - now;
// 		}

// 		private async void CheckForNewCoupon(object state)
// 		{
// 			Console.WriteLine("CheckForNewCoupon 호출됨");

// 			string couponCode = await GetLatestCouponCode();

// 			Console.WriteLine("쿠폰 코드: " + couponCode);
// 			if (!string.IsNullOrEmpty(couponCode))
// 			{
// 				IMessageChannel? channel = _client.GetChannel() as IMessageChannel; // 알림을 보낼 채널 ID로 교체
// 				if (channel != null)
// 				{
// 					await channel.SendMessageAsync($"새로운 유니티 에셋 스토어 쿠폰 코드 : `{couponCode}`");
// 				}
// 			}
// 		}

// 		private static async Task<string> GetLatestCouponCode()
// 		{
// 			Console.WriteLine("쿠폰 코드 확인 중...");

// 			string url = "https://assetstore.unity.com/ko-KR/publisher-sale";
// 			HttpClient httpClient = new HttpClient();
// 			string response = await httpClient.GetStringAsync(url);

// 			HtmlDocument htmlDoc = new HtmlDocument();
// 			htmlDoc.LoadHtml(response);

// 			// 쿠폰 코드가 포함된 HTML 요소를 찾기 위한 XPath 또는 CSS 선택자 사용
// 			HtmlNode couponNode = htmlDoc.DocumentNode.SelectSingleNode("//*[@id=\"main\"]/section[2]/div/div/div[1]/div[2]/span[2]/text()");

// 			// Add POLYGON Construction - Low Poly 3D Art by Synty to your cart, then enter the coupon code SYNTY2024 at checkout to get it for free. No purchase necessary.*
// 			// 위 같은 형식에서 'SYNTY2024' (coupon code) 뒤에 있는 문자열을 가져오기 위한 코드 정규식

// 			string couponCode = string.Empty;
// 			if (couponNode != null)
// 			{
// 				Match match = Regex.Match(couponNode.InnerText, @"(?<=coupon code )\w+");
// 				if (match.Success)
// 				{
// 					couponCode = match.Value;
// 				}
// 			}

// 			return couponCode;
// 		}
// 	}
// }