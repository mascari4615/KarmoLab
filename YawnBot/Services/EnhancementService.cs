using Discord;
using Discord.WebSocket;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using YawnBot;
using YawnBot.Models;

namespace YawnBot.Services
{
	public class EnhancementService
	{
		private readonly Random _random;
		private readonly GameDataService _gameData;
		private readonly LoggingService _loggingService;
		private const string EnhancementImageBasePath = "Resources/img/enhancement";
		private const double GreatSuccessProbability = 0.5; // 대성공 확률 (%)
		private readonly ConcurrentDictionary<ulong, bool> _processingUsers = new();

		public EnhancementService(Random random, GameDataService gameData, LoggingService loggingService)
		{
			_random = random;
			_gameData = gameData;
			_loggingService = loggingService;
		}

		// 유저 데이터 초기화 헬퍼
		private void EnsureUserData(ulong userId)
		{
			if (!_gameData.UserSwords.ContainsKey(userId))
			{
				// 0강 초기화 시 랜덤 무기 선택
				var (img, name, type) = GetRandomWeaponImage(0, null);
				_gameData.UserSwords[userId] = new SwordData { Level = 0, ImageName = img, Name = name, WeaponType = type };
			}
			else
			{
				// 기존 데이터 마이그레이션: WeaponType이 없으면 ImageName에서 추론
				var sword = _gameData.UserSwords[userId];
				if (string.IsNullOrEmpty(sword.WeaponType) && !string.IsNullOrEmpty(sword.ImageName))
				{
					var fileName = Path.GetFileName(sword.ImageName);
					var parts = fileName.Split('_');
					if (parts.Length > 0)
					{
						sword.WeaponType = parts[0];
					}
				}
			}

			if (!_gameData.UserMoney.ContainsKey(userId)) _gameData.UserMoney[userId] = 100000; // 초기 자금
			if (!_gameData.UserMaxSwordLevels.ContainsKey(userId)) _gameData.UserMaxSwordLevels[userId] = 0;
		}

		public async Task EnhanceSwordAsync(IUser user, IMessageChannel channel)
		{
			ulong userId = user.Id;
			if (_processingUsers.TryGetValue(userId, out bool isProcessing) && isProcessing)
			{
				await channel.SendMessageAsync("🚫 이전 작업이 진행 중입니다. 잠시만 기다려주세요.");
				return;
			}

			_processingUsers[userId] = true;
			try
			{
				EnsureUserData(userId);

				var userSword = _gameData.UserSwords[userId];
				int currentLevel = userSword.Level;

				if (currentLevel >= 15)
				{
					var embed = new EmbedBuilder()
						.WithTitle("🎉 최고 레벨 도달!")
						.WithDescription("더 이상 강화할 수 없습니다.")
						.WithColor(Color.Gold);
					await SendEmbedAsync(channel, embed);
					return;
				}

				var info = _gameData.UpgradeInfos.FirstOrDefault(x => x.Level == currentLevel);
				if (info == null)
				{
					var embed = new EmbedBuilder()
						.WithTitle("🚫 오류 발생")
						.WithDescription($"강화 정보를 찾을 수 없습니다. (Level: {currentLevel})\n관리자에게 문의해주세요.")
						.WithColor(Color.Red);
					await SendEmbedAsync(channel, embed);

					await _loggingService.LogErrorAsync("EnhancementService", "UpgradeInfo not found", new { UserId = userId, Level = currentLevel });
					return;
				}

				long cost = info.Cost;

				if (!_gameData.TrySpendMoney(userId, cost))
				{
					var embed = new EmbedBuilder()
						.WithTitle("💸 돈이 부족합니다!")
						.AddField("필요한 금액", $"{cost}원", true)
						.AddField("보유 금액", $"{_gameData.UserMoney[userId]}원", true)
						.WithColor(Color.Red);
					await SendEmbedAsync(channel, embed);
					return;
				}

				// 확률 계산
				double successProb = info.Success;
				double roll = _random.NextDouble() * 100;
				bool isGreatSuccess = _random.NextDouble() * 100 <= GreatSuccessProbability;

				var retryComponent = new ComponentBuilder()
					.WithButton("강화", "enhance_retry", ButtonStyle.Primary)
					.Build();

				var successComponent = new ComponentBuilder()
					.WithButton("강화", "enhance_retry", ButtonStyle.Primary)
					.WithButton("판매", "sell_sword", ButtonStyle.Secondary)
					.Build();

				if (isGreatSuccess)
				{
					int increase = 3;
					int oldLevel = userSword.Level;
					userSword.Level = Math.Min(userSword.Level + increase, 15);

					var (newImg, newName, newType) = GetRandomWeaponImage(userSword.Level, userSword.WeaponType);
					userSword.ImageName = newImg;
					userSword.Name = newName;
					userSword.WeaponType = newType;

					if (userSword.Level > _gameData.UserMaxSwordLevels[userId])
					{
						_gameData.UserMaxSwordLevels[userId] = userSword.Level;
					}

					string? imagePath = GetImagePath(userSword.ImageName);
					string chatMsg = GetRandomChatMessage(userSword.Level, "success");
					string lore = GetWeaponLore(userSword.WeaponType, userSword.Level);

					var embed = new EmbedBuilder()
						.WithTitle("🌟 대성공!!! 🌟")
						.WithDescription($"{user.Mention}님, **{userSword.Name}** 대성공으로 강화에 성공했습니다! [ +{oldLevel} ==> +{userSword.Level} ]")
						.AddField("상승폭", $"+{userSword.Level - oldLevel}강", true)
						.AddField("대장장이의 한마디", $"\"{chatMsg}\"");

					if (!string.IsNullOrEmpty(lore))
					{
						embed.AddField("전설", $"*{lore}*");
					}

					embed.AddField("소요된 비용", $"{cost}원", true)
						 .AddField("남은 돈", $"{_gameData.UserMoney[userId]}원", true)
						 .WithColor(Color.Gold);

					await SendEmbedAsync(channel, embed, imagePath, successComponent);

					if (userSword.Level >= 10)
					{
						var newsEmbed = new EmbedBuilder()
							.WithTitle("📰 [속보] 전설의 탄생?!")
							.WithDescription($"📢 **{user.Username}**님이 **+{userSword.Level}강 {userSword.Name}** 강화에 성공했습니다!!!")
							.WithColor(Color.Purple)
							.WithThumbnailUrl(user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl());

						await channel.SendMessageAsync(embed: newsEmbed.Build());
					}
				}
				else if (roll <= successProb)
				{
					userSword.Level++;
					var (newImg, newName, newType) = GetRandomWeaponImage(userSword.Level, userSword.WeaponType);
					userSword.ImageName = newImg; // 레벨업 시 새로운 이미지 할당
					userSword.Name = newName;
					userSword.WeaponType = newType;

					if (userSword.Level > _gameData.UserMaxSwordLevels[userId])
					{
						_gameData.UserMaxSwordLevels[userId] = userSword.Level;
					}

					string? imagePath = GetImagePath(userSword.ImageName);
					string chatMsg = GetRandomChatMessage(userSword.Level, "success");
					string lore = GetWeaponLore(userSword.WeaponType, userSword.Level);

					var embed = new EmbedBuilder()
						.WithTitle("🎉 강화 성공!")
						.WithDescription($"{user.Mention}님, **{userSword.Name}** 강화에 성공했습니다! [ +{userSword.Level - 1} ==> +{userSword.Level} ]")
						.AddField("대장장이의 한마디", $"\"{chatMsg}\"");

					if (!string.IsNullOrEmpty(lore))
					{
						embed.AddField("전설", $"*{lore}*");
					}

					embed.AddField("소요된 비용", $"{cost}원", true)
						 .AddField("남은 돈", $"{_gameData.UserMoney[userId]}원", true)
						 .WithColor(Color.Green);

					await SendEmbedAsync(channel, embed, imagePath, successComponent);

					if (userSword.Level >= 10)
					{
						var newsEmbed = new EmbedBuilder()
							.WithTitle("📰 [속보] 엄청난 무기가 나타났다!")
							.WithDescription($"📢 **{user.Username}**님이 **+{userSword.Level}강 {userSword.Name}** 강화에 성공했습니다!!!\n이 기세라면 세계 정복도 가능하겠는데요?! 👏👏👏")
							.WithColor(Color.Purple)
							.WithThumbnailUrl(user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl());

						await channel.SendMessageAsync(embed: newsEmbed.Build());
					}
				}
				else
				{
					// 실패 시 파괴 방어 로직 (35% 확률)
					bool isProtected = _random.NextDouble() * 100 <= 35.0;

					if (isProtected)
					{
						// 유지
						string? maintainImageName = GetRandomImage("강화_유지_");
						string? maintainImagePath = GetImagePath(maintainImageName);
						string chatMsg = GetRandomChatMessage(userSword.Level, "maintain");

						var embed = new EmbedBuilder()
							.WithTitle("🛡️ 강화 실패... 하지만 무기는 무사합니다!")
							.WithDescription($"{user.Mention}님의 무기가 **+{userSword.Level}강 {userSword.Name}**(으)로 유지되었습니다.")
							.AddField("대장장이의 한마디", $"\"{chatMsg}\"")
							.AddField("소요된 비용", $"{cost}원", true)
							.AddField("남은 돈", $"{_gameData.UserMoney[userId]}원", true)
							.WithColor(Color.Blue);

						await SendEmbedAsync(channel, embed, maintainImagePath, successComponent);
					}
					else
					{
						userSword.Level = 0; // 파괴
											 // 파괴 시 새로운 무기 랜덤 배정 (0강)
						var (resetImg, resetName, resetType) = GetRandomWeaponImage(0, null);
						userSword.ImageName = resetImg;
						userSword.Name = resetName;
						userSword.WeaponType = resetType;

						var builder = new ComponentBuilder()
							.WithButton("강화", "enhance_retry", ButtonStyle.Primary)
							.WithButton("위로하기", "consolation", ButtonStyle.Secondary);

						string? destroyImageName = GetRandomImage("강화_실패_");
						string? destroyImagePath = GetImagePath(destroyImageName);
						string chatMsg = GetRandomChatMessage(currentLevel + 1, "fail");

						var embed = new EmbedBuilder()
							.WithTitle("💥 강화 실패...")
							.WithDescription($"{user.Mention}님의 무기가 깨졌습니다...\n하지만 대장장이가 **{userSword.Name}**을(를) 무료로 주었습니다.")
							.AddField("대장장이의 한마디", $"\"{chatMsg}\"")
							.AddField("비용", $"{cost}원", true)
							.AddField("남은 돈", $"{_gameData.UserMoney[userId]}원", true)
							.WithColor(Color.Red);

						await SendEmbedAsync(channel, embed, destroyImagePath, builder.Build());
					}
				}
			}
			finally
			{
				_processingUsers.TryRemove(userId, out _);
			}
		}

		public async Task SellSwordAsync(IUser user, IMessageChannel channel)
		{
			ulong userId = user.Id;
			if (_processingUsers.TryGetValue(userId, out bool isProcessing) && isProcessing)
			{
				await channel.SendMessageAsync("🚫 이전 작업이 진행 중입니다. 잠시만 기다려주세요.");
				return;
			}

			_processingUsers[userId] = true;
			try
			{
				EnsureUserData(userId);

				var userSword = _gameData.UserSwords[userId];
				int currentLevel = userSword.Level;
				if (currentLevel == 0)
				{
					var embed = new EmbedBuilder()
						.WithTitle("🚫 판매 불가")
						.WithDescription("0강 검은 팔 수 없습니다! 강화 후에 판매하세요.")
						.WithColor(Color.Red);
					await SendEmbedAsync(channel, embed);
					return;
				}

				// 판매 가격 계산
				long basePrice = 0;
				var info = _gameData.UpgradeInfos.FirstOrDefault(x => x.Level == currentLevel);
				if (info != null)
				{
					basePrice = info.SellPrice;
				}
				else
				{
					basePrice = currentLevel * 10000;
				}

				// 감정 시작 메시지
				var appraisalEmbed = new EmbedBuilder()
					.WithTitle("🔍 감정 중...")
					.WithDescription($"대장장이가 **+{currentLevel}강 {userSword.Name}**을(를) 꼼꼼히 살펴보고 있습니다...")
					.WithColor(Color.Orange);

				var message = await channel.SendMessageAsync(embed: appraisalEmbed.Build());
				await Task.Delay(2000); // 2초 대기

				// 감정가 계산 (0.9 ~ 1.5 배)
				double multiplier = 0.9 + (_random.NextDouble() * 0.6);
				long finalPrice = (long)(basePrice * multiplier);

				// 1원 단위까지 랜덤 변동 추가 (-50 ~ +50)
				finalPrice += _random.Next(-50, 51);
				if (finalPrice < 0) finalPrice = 0;

				_gameData.AddMoney(userId, finalPrice);

				userSword.Level = 0; // 판매 후 초기화
				var (resetImg, resetName, resetType) = GetRandomWeaponImage(0, null);
				userSword.ImageName = resetImg;
				userSword.Name = resetName;
				userSword.WeaponType = resetType;

				string appraisalComment = "";
				if (multiplier >= 1.3) appraisalComment = "상태가 아주 훌륭하군요! 값을 더 쳐드리겠습니다.";
				else if (multiplier <= 1.0) appraisalComment = "흠... 흠집이 좀 있네요. 많이는 못 드립니다.";
				else appraisalComment = "적당한 물건이군요. 시세대로 드리겠습니다.";

				var successEmbed = new EmbedBuilder()
					.WithTitle("💰 판매 완료!")
					.WithDescription($"감정 결과: **{finalPrice:N0}원**")
					.AddField("기본 시세", $"{basePrice:N0}원", true)
					.AddField("감정가", $"{finalPrice:N0}원 ({(multiplier * 100):F0}%)", true)
					.AddField("대장장이의 평가", $"\"{appraisalComment}\"")
					.AddField("현재 보유 금액", $"{_gameData.UserMoney[userId]:N0}원", true)
					.WithColor(Color.Green);

				var component = new ComponentBuilder()
					.WithButton("강화", "enhance_retry", ButtonStyle.Primary)
					.Build();

				await message.ModifyAsync(m => 
				{
					m.Embed = successEmbed.Build();
					m.Components = component;
				});
			}
			finally
			{
				_processingUsers.TryRemove(userId, out _);
			}
		}

		public async Task ShowInfoAsync(IUser user, IMessageChannel channel)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			var userSword = _gameData.UserSwords[userId];
			int level = userSword.Level;
			long money = _gameData.UserMoney[userId];
			int maxLevel = _gameData.UserMaxSwordLevels[userId];
			string swordName = userSword.Name ?? "이름 없는 검";

			string? imagePath = GetImagePath(userSword.ImageName);

			var embed = new EmbedBuilder()
				.WithTitle($"⚔️ {user.Username}님의 정보")
				.AddField("검 이름", $"**{swordName}** (+{level}강)", true)
				.AddField("최대 달성 레벨", $"+{maxLevel}강", true)
				.AddField("보유 금액", $"{money}원", true)
				.WithColor(Color.Blue);

			await SendEmbedAsync(channel, embed, imagePath);
		}

		public async Task ShowMoneyAsync(IUser user, IMessageChannel channel)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);
			long money = _gameData.UserMoney[userId];

			var embed = new EmbedBuilder()
				.WithTitle("💰 보유 금액")
				.WithDescription($"**{user.Username}**님의 현재 자산: {money}원")
				.WithColor(Color.Green);
			await SendEmbedAsync(channel, embed);
		}

		public async Task BattleAsync(IUser user, IUser targetUser, IMessageChannel channel)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			if (targetUser == null)
			{
				var embed = new EmbedBuilder()
					.WithTitle("⚠️ 대상 오류")
					.WithDescription("대결할 상대를 멘션해주세요! 예: `/배틀 @상대방`")
					.WithColor(Color.Orange);
				await SendEmbedAsync(channel, embed);
				return;
			}

			if (targetUser.Id == userId)
			{
				var embed = new EmbedBuilder()
					.WithTitle("⚠️ 대상 오류")
					.WithDescription("자기 자신과는 싸울 수 없습니다.")
					.WithColor(Color.Orange);
				await SendEmbedAsync(channel, embed);
				return;
			}

			if (targetUser.IsBot)
			{
				var embed = new EmbedBuilder()
					.WithTitle("⚠️ 대상 오류")
					.WithDescription("봇과는 싸울 수 없습니다.")
					.WithColor(Color.Orange);
				await SendEmbedAsync(channel, embed);
				return;
			}

			// 상대방 데이터 초기화 확인
			EnsureUserData(targetUser.Id);

			// 일일 제한 확인
			if (!_gameData.DailyBattleCounts.ContainsKey(userId) || _gameData.DailyBattleCounts[userId].Date != DateTime.Today)
			{
				_gameData.DailyBattleCounts[userId] = new DailyBattleInfo { Date = DateTime.Today, Count = 0 };
			}

			if (_gameData.DailyBattleCounts[userId].Count >= 10)
			{
				var embed = new EmbedBuilder()
					.WithTitle("🔥 일일 제한 도달")
					.WithDescription("오늘의 대결 횟수를 모두 소진했습니다! (하루 10회)")
					.WithColor(Color.Red);
				await SendEmbedAsync(channel, embed);
				return;
			}

			int myLevel = _gameData.UserSwords[userId].Level;
			int targetLevel = _gameData.UserSwords[targetUser.Id].Level;
			string mySwordName = _gameData.UserSwords[userId].Name ?? "이름 없는 검";
			string targetSwordName = _gameData.UserSwords[targetUser.Id].Name ?? "이름 없는 검";

			// 승률 계산 (기본 50%, 레벨 차이당 5% 변동, 최소 5% ~ 최대 95%)
			int levelDiff = myLevel - targetLevel;
			int winChance = 50 + (levelDiff * 5);
			winChance = Math.Clamp(winChance, 5, 95);

			int roll = _random.Next(1, 101);
			bool isWin = roll <= winChance;

			// 대결 횟수 증가
			_gameData.DailyBattleCounts[userId].Count++;
			int remainingBattles = 10 - _gameData.DailyBattleCounts[userId].Count;

			string? battleImageName = GetRandomImage("배틀_시작_");
			string? battleImagePath = GetImagePath(battleImageName);

			if (isWin)
			{
				// 보상 계산
				long baseReward = 300;
				long levelBonus = targetLevel * 100;
				long reward = baseReward + levelBonus;

				// 나보다 강한 상대를 이겼을 때 보너스 (언더독 보너스)
				if (targetLevel > myLevel)
				{
					reward *= 2; // 보상 2배
				}

				_gameData.AddMoney(userId, reward);

				var embed = new EmbedBuilder()
					.WithTitle("⚔️ 대결 승리!")
					.WithDescription($"{user.Mention}님이 {targetUser.Mention}님을 이겼습니다!")
					.AddField("나의 검", $"+{myLevel}강 {mySwordName}", true)
					.AddField("상대의 검", $"+{targetLevel}강 {targetSwordName}", true)
					.AddField("보상", $"{reward}원", true)
					.AddField("남은 대결 횟수", $"{remainingBattles}회", true)
					.WithColor(Color.Green);

				await SendEmbedAsync(channel, embed, battleImagePath);
			}
			else
			{
				var embed = new EmbedBuilder()
					.WithTitle("🏳️ 대결 패배...")
					.WithDescription($"{user.Mention}님이 {targetUser.Mention}님에게 졌습니다...")
					.AddField("나의 검", $"+{myLevel}강 {mySwordName}", true)
					.AddField("상대의 검", $"+{targetLevel}강 {targetSwordName}", true)
					.AddField("남은 대결 횟수", $"{remainingBattles}회", true)
					.WithColor(Color.Red);

				await SendEmbedAsync(channel, embed, battleImagePath);
			}
		}

		public async Task ShowRankingAsync(IMessageChannel channel, DiscordSocketClient client)
		{
			var sortedUsers = _gameData.UserMoney.OrderByDescending(x => x.Value).ToList();
			var embed = new EmbedBuilder()
				.WithTitle("🏆 전체 랭킹 (돈 순)")
				.WithColor(Color.Gold);

			int rank = 1;
			string description = "";
			foreach (var user in sortedUsers)
			{
				if (rank > 10) break; // Top 10만 표시

				ulong id = user.Key;
				var socketUser = client.GetUser(id);
				string username = socketUser?.Username ?? "알 수 없는 유저";

				int currentLv = _gameData.UserSwords.ContainsKey(id) ? _gameData.UserSwords[id].Level : 0;
				int maxLv = _gameData.UserMaxSwordLevels.ContainsKey(id) ? _gameData.UserMaxSwordLevels[id] : 0;
				long money = user.Value;

				description += $"{rank}. **{username}**\n💰 {money}원 | ⚔️ 현재 +{currentLv}강 | 🌟 최대 +{maxLv}강\n\n";
				rank++;
			}

			if (sortedUsers.Count == 0)
			{
				description = "데이터가 없습니다.";
			}

			embed.WithDescription(description);
			await SendEmbedAsync(channel, embed);
		}

		public async Task CheckAttendanceAsync(IUser user, IMessageChannel channel)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			if (!_gameData.LastAttendance.ContainsKey(userId))
			{
				_gameData.LastAttendance[userId] = DateTime.MinValue;
			}

			DateTime lastCheck = _gameData.LastAttendance[userId];
			TimeSpan diff = DateTime.Now - lastCheck;

			if (diff.TotalHours >= 1)
			{
				long reward = 1000;
				_gameData.AddMoney(userId, reward);
				_gameData.LastAttendance[userId] = DateTime.Now;

				var embed = new EmbedBuilder()
					.WithTitle("📅 출석체크 완료!")
					.WithDescription($"{reward}원을 받았습니다!")
					.AddField("현재 보유 금액", $"{_gameData.UserMoney[userId]}원", true)
					.WithColor(Color.Green);
				await SendEmbedAsync(channel, embed);
			}
			else
			{
				TimeSpan remaining = TimeSpan.FromHours(1) - diff;
				var embed = new EmbedBuilder()
					.WithTitle("⏳ 아직 출석체크를 할 수 없습니다.")
					.WithDescription($"남은 시간: {remaining.Minutes}분 {remaining.Seconds}초")
					.WithColor(Color.Orange);
				await SendEmbedAsync(channel, embed);
			}
		}

		public async Task GiveMeMoneyAsync(IUser user, IMessageChannel channel)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			// 1 ~ 2,500 랜덤 지급
			long amount = _random.Next(1, 2501);
			_gameData.AddMoney(userId, amount);

			var successEmbed = new EmbedBuilder()
				.WithTitle("💰 돈내놔 성공!")
				.WithDescription($"옛다, 가져가라.")
				.AddField("획득 금액", $"{amount}원", true)
				.AddField("현재 보유 금액", $"{_gameData.UserMoney[userId]}원", true)
				.WithColor(Color.Green);
			await SendEmbedAsync(channel, successEmbed);
		}


		public async Task SlotAsync(IUser user, IMessageChannel channel, long betAmount)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			if (betAmount <= 0)
			{
				await channel.SendMessageAsync("배팅 금액은 0보다 커야 합니다.");
				return;
			}

			if (!_gameData.TrySpendMoney(userId, betAmount))
			{
				await channel.SendMessageAsync($"돈이 부족합니다. (보유: {_gameData.UserMoney[userId]}원)");
				return;
			}

			// 슬롯 심볼
			string[] symbols = { "🍒", "🍋", "🍇", "💎", "7️⃣" };

			// 최종 결과 미리 결정
			string s1 = symbols[_random.Next(symbols.Length)];
			string s2 = symbols[_random.Next(symbols.Length)];
			string s3 = symbols[_random.Next(symbols.Length)];

			// 애니메이션 효과
			var embed = new EmbedBuilder()
				.WithTitle("🎰 슬롯 머신 돌아가는 중...")
				.WithDescription("**[ ❓ | ❓ | ❓ ]**")
				.WithColor(Color.Orange);

			var message = await channel.SendMessageAsync(embed: embed.Build());

			// 1단계: 첫 번째 슬롯 결정
			for (int i = 0; i < 3; i++)
			{
				await Task.Delay(300);
				string t1 = symbols[_random.Next(symbols.Length)];
				string t2 = symbols[_random.Next(symbols.Length)];
				string t3 = symbols[_random.Next(symbols.Length)];
				embed.WithDescription($"**[ {t1} | {t2} | {t3} ]**");
				await message.ModifyAsync(m => m.Embed = embed.Build());
			}

			// 첫 번째 고정
			embed.WithDescription($"**[ {s1} | ❓ | ❓ ]**");
			await message.ModifyAsync(m => m.Embed = embed.Build());
			await Task.Delay(500);

			// 2단계: 두 번째 슬롯 결정
			for (int i = 0; i < 3; i++)
			{
				await Task.Delay(300);
				string t2 = symbols[_random.Next(symbols.Length)];
				string t3 = symbols[_random.Next(symbols.Length)];
				embed.WithDescription($"**[ {s1} | {t2} | {t3} ]**");
				await message.ModifyAsync(m => m.Embed = embed.Build());
			}

			// 두 번째 고정
			embed.WithDescription($"**[ {s1} | {s2} | ❓ ]**");
			await message.ModifyAsync(m => m.Embed = embed.Build());
			await Task.Delay(500);

			// 3단계: 세 번째 슬롯 결정
			for (int i = 0; i < 3; i++)
			{
				await Task.Delay(300);
				string t3 = symbols[_random.Next(symbols.Length)];
				embed.WithDescription($"**[ {s1} | {s2} | {t3} ]**");
				await message.ModifyAsync(m => m.Embed = embed.Build());
			}

			// 최종 결과 표시
			// 결과 계산
			long payout = 0;
			string resultMsg = "꽝!";

			if (s1 == "7️⃣" && s2 == "7️⃣" && s3 == "7️⃣") { payout = betAmount * 77; resultMsg = "Jackpot! (77배)"; }
			else if (s1 == "💎" && s2 == "💎" && s3 == "💎") { payout = betAmount * 50; resultMsg = "Diamond! (50배)"; }
			else if (s1 == s2 && s2 == s3) { payout = betAmount * 10; resultMsg = "Triple! (10배)"; }
			else if (s1 == s2 || s2 == s3 || s1 == s3) { payout = betAmount * 2; resultMsg = "Double! (2배)"; }

			if (payout > 0)
			{
				_gameData.AddMoney(userId, payout);
			}

			embed.WithTitle("🎰 슬롯 머신 결과")
				.WithDescription($"**[ {s1} | {s2} | {s3} ]**\n\n{resultMsg}")
				.AddField("배팅", $"{betAmount}원", true)
				.AddField("획득", $"{payout}원", true)
				.AddField("잔액", $"{_gameData.UserMoney[userId]}원", true)
				.WithColor(payout > 0 ? Color.Gold : Color.DarkGrey);

			await message.ModifyAsync(m => m.Embed = embed.Build());
		}

		public Task UpDownGameAsync(IUser user, IMessageChannel channel)
		{
			// 간단하게 1~100 사이 숫자 맞추기 (세션 없이 단판 승부? 아니면 세션?)
			// 세션 없이: 봇이 숫자를 생각하고, 유저가 찍는건 불가능 (상호작용 필요)
			// 따라서 "업다운 게임 시작" -> 버튼으로 진행? 버튼은 100개 만들 수 없음.
			// 채팅으로 진행해야 함.
			// 세션 관리 필요.
			// 간단하게: /업다운 <숫자> 로 바로 찍기? (봇이 매번 랜덤이면 맞출 확률 1/100) -> 이건 로또.
			// 업다운은 "Up", "Down" 힌트를 줘야 함.
			// 구현 복잡도가 높으므로, 여기서는 "홀짝"과 "가위바위보" 먼저 구현하고, 
			// 업다운은 "1~10 사이 숫자 맞추기"로 축소하거나, 별도 세션 매니저를 도입해야 함.
			// 일단 홀짝/가위바위보 먼저 구현.
			return Task.CompletedTask;
		}

		public async Task OddEvenAsync(IUser user, IMessageChannel channel, string choice, long betAmount)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			if (betAmount <= 0)
			{
				await channel.SendMessageAsync("배팅 금액은 0보다 커야 합니다.");
				return;
			}

			if (!_gameData.TrySpendMoney(userId, betAmount))
			{
				await channel.SendMessageAsync($"돈이 부족합니다. (보유: {_gameData.UserMoney[userId]}원)");
				return;
			}

			bool isOdd = _random.Next(2) == 1; // true: 홀, false: 짝
			string resultStr = isOdd ? "홀" : "짝";
			bool win = (choice == "홀" && isOdd) || (choice == "짝" && !isOdd);

			long payout = 0;
			if (win)
			{
				payout = betAmount * 2;
				_gameData.AddMoney(userId, payout);
			}

			var embed = new EmbedBuilder()
				.WithTitle("🎲 홀짝 게임")
				.WithDescription($"결과: **{resultStr}**")
				.AddField("선택", choice, true)
				.AddField("배팅", $"{betAmount}원", true)
				.AddField("결과", win ? $"승리! (+{payout}원)" : "패배...", true)
				.WithColor(win ? Color.Green : Color.Red);

			await SendEmbedAsync(channel, embed);
		}

		public async Task RpsAsync(IUser user, IMessageChannel channel, string choice, long betAmount)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			if (betAmount <= 0)
			{
				await channel.SendMessageAsync("배팅 금액은 0보다 커야 합니다.");
				return;
			}

			if (!_gameData.TrySpendMoney(userId, betAmount))
			{
				await channel.SendMessageAsync($"돈이 부족합니다. (보유: {_gameData.UserMoney[userId]}원)");
				return;
			}

			string[] rps = { "가위", "바위", "보" };
			string botChoice = rps[_random.Next(3)];

			// 승패 판정
			int userIdx = Array.IndexOf(rps, choice);
			int botIdx = Array.IndexOf(rps, botChoice);

			// 0:가위, 1:바위, 2:보
			// (0,1)->1승, (1,2)->2승, (2,0)->0승
			// (user - bot + 3) % 3 == 1 -> user win
			// == 2 -> user lose
			// == 0 -> draw

			int result = (userIdx - botIdx + 3) % 3;
			long payout = 0;
			string resultMsg = "";
			Color color = Color.LightGrey;

			if (result == 0) // 무승부
			{
				payout = betAmount; // 원금 반환
				_gameData.AddMoney(userId, payout);
				resultMsg = "무승부 (원금 반환)";
				color = Color.Orange;
			}
			else if (result == 1) // 승리
			{
				payout = betAmount * 2;
				_gameData.AddMoney(userId, payout);
				resultMsg = $"승리! (+{payout}원)";
				color = Color.Green;
			}
			else // 패배
			{
				resultMsg = "패배...";
				color = Color.Red;
			}

			var embed = new EmbedBuilder()
				.WithTitle("✌️✊🖐️ 가위바위보")
				.AddField("나", choice, true)
				.AddField("봇", botChoice, true)
				.AddField("결과", resultMsg, true)
				.WithColor(color);

			await SendEmbedAsync(channel, embed);
		}

		public (string ImageName, string Name, string WeaponType) GetRandomWeaponImage(int level, string? currentWeaponType)
		{
			try
			{
				// 0레벨이거나 무기 타입이 없으면 랜덤 선택
				if (level == 0 || string.IsNullOrEmpty(currentWeaponType))
				{
					var keys = _gameData.WeaponLores.Keys.ToList();
					if (keys.Count > 0)
					{
						currentWeaponType = keys[_random.Next(keys.Count)];
					}
					else
					{
						// 데이터가 없으면 기본값
						currentWeaponType = "곡괭이";
					}
				}

				// 파일 검색 패턴: {WeaponType}/{WeaponType}_Lv{Level}_*.png
				// 레벨 0인 경우 레벨 1 이미지를 사용 (낡은 상태)
				int searchLevel = level == 0 ? 1 : level;

				string weaponPath = Path.Combine(EnhancementImageBasePath, currentWeaponType);
				if (!Directory.Exists(weaponPath)) return ($"default.png", "알 수 없는 무기", currentWeaponType ?? "Unknown");

				var files = Directory.GetFiles(weaponPath, $"{currentWeaponType}_Lv{searchLevel}_*.png");
				if (files.Length > 0)
				{
					string filePath = files[_random.Next(files.Length)];
					string fileName = Path.GetFileName(filePath);

					// 파일명 형식: {WeaponType}_Lv{Level}_{Title}_{LoreSnippet}.png
					string name = "이름 없는 무기";
					string namePart = Path.GetFileNameWithoutExtension(fileName);
					var parts = namePart.Split('_');
					if (parts.Length >= 3)
					{
						// 예: 낡은 곡괭이
						name = $"{parts[2]} {parts[0]}";
					}

					return (Path.Combine(currentWeaponType, fileName), name, currentWeaponType);
				}
			}
			catch (Exception ex)
			{
				_loggingService.LogErrorAsync("EnhancementService", "GetRandomWeaponImage Error", ex).Wait();
			}

			return ($"default.png", "알 수 없는 무기", currentWeaponType ?? "Unknown");
		}

		public string GetWeaponLore(string weaponType, int level)
		{
			if (_gameData.WeaponLores.TryGetValue(weaponType, out var loreData))
			{
				// 레벨 0은 레벨 1의 로어를 사용
				int searchLevel = level == 0 ? 1 : level;
				var stage = loreData.Stages.FirstOrDefault(s => s.Level == searchLevel);
				if (stage != null)
				{
					return stage.Lore;
				}
			}
			return "";
		}

		public string? GetRandomImage(string prefix)
		{
			try
			{
				string etcPath = Path.Combine(EnhancementImageBasePath, "Etc");
				if (!Directory.Exists(etcPath)) return null;

				var files = Directory.GetFiles(etcPath, $"{prefix}*.png");
				if (files.Length > 0)
				{
					return Path.Combine("Etc", Path.GetFileName(files[_random.Next(files.Length)]));
				}
			}
			catch { }
			return null;
		}

		private string? GetImagePath(string? imageName)
		{
			if (string.IsNullOrEmpty(imageName)) return null;
			return Path.Combine(EnhancementImageBasePath, imageName);
		}

		private string GetRandomChatMessage(int level, string type)
		{
			if (_gameData.ChatData == null) return "";

			string key = level.ToString();
			if (_gameData.ChatData.ContainsKey(key))
			{
				var data = _gameData.ChatData[key];
				List<string>? list = null;

				if (type == "success") list = data.success;
				else if (type == "fail") list = data.fail;
				else if (type == "maintain") list = data.maintain;

				if (list != null && list.Count > 0)
				{
					return list[_random.Next(list.Count)];
				}
			}
			return "";
		}

		public async Task SendEmbedAsync(IMessageChannel channel, EmbedBuilder embed, string? imagePath = null, MessageComponent? components = null)
		{
			if (!string.IsNullOrEmpty(imagePath) && File.Exists(imagePath))
			{
				string fileName = Path.GetFileName(imagePath);
				embed.WithThumbnailUrl($"attachment://{fileName}");
				await channel.SendFileAsync(imagePath, embed: embed.Build(), components: components);
			}
			else
			{
				await channel.SendMessageAsync(embed: embed.Build(), components: components);
			}
		}
	}
}
