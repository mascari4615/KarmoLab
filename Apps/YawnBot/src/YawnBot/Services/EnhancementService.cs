using Discord;
using Discord.WebSocket;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using KarmoLab.YawnBot;
using KarmoLab.YawnBot.Models;

namespace KarmoLab.YawnBot.Services
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
				(string img, string name, string type) = GetRandomWeaponImage(0, null);
				_gameData.UserSwords[userId] = new SwordData { Level = 0, ImageName = img, Name = name, WeaponType = type };
			}
			else
			{
				// 기존 데이터 마이그레이션: WeaponType이 없으면 ImageName에서 추론
				SwordData sword = _gameData.UserSwords[userId];
				if (string.IsNullOrEmpty(sword.WeaponType) && !string.IsNullOrEmpty(sword.ImageName))
				{
					string fileName = Path.GetFileName(sword.ImageName);
					string[] parts = fileName.Split('_');
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
				await channel.SendMessageAsync(_gameData.GetMessage(BotMessageKey.Common_Busy));
				return;
			}

			_processingUsers[userId] = true;
			try
			{
				EnsureUserData(userId);

				SwordData userSword = _gameData.UserSwords[userId];
				int currentLevel = userSword.Level;

				if (currentLevel >= 15)
				{
					EmbedBuilder embed = new EmbedBuilder()
						.WithTitle(_gameData.GetMessage(BotMessageKey.Enhance_MaxLevel_Title))
						.WithDescription(_gameData.GetMessage(BotMessageKey.Enhance_MaxLevel_Desc))
						.WithColor(Color.Gold);
					await SendEmbedAsync(channel, embed);
					return;
				}

				UpgradeInfo? info = _gameData.UpgradeInfos.FirstOrDefault(x => x.Level == currentLevel);

				if (info == null)
				{
					EmbedBuilder embed = new EmbedBuilder()
						.WithTitle(_gameData.GetMessage(BotMessageKey.Enhance_Error_Title))
						.WithDescription(_gameData.GetMessage(BotMessageKey.Enhance_Error_Desc, currentLevel))
						.WithColor(Color.Red);
					await SendEmbedAsync(channel, embed);

					await _loggingService.LogErrorAsync("EnhancementService", "UpgradeInfo not found", new { UserId = userId, Level = currentLevel });
					return;
				}

				long cost = info.Cost;

				if (!_gameData.TrySpendMoney(userId, cost))
				{
					EmbedBuilder embed = new EmbedBuilder()
						.WithTitle(_gameData.GetMessage(BotMessageKey.Enhance_NoMoney_Title))
						.AddField(_gameData.GetMessage(BotMessageKey.Enhance_NoMoney_Cost), $"{cost}원", true)
						.AddField(_gameData.GetMessage(BotMessageKey.Enhance_NoMoney_Balance), $"{_gameData.UserMoney[userId]}원", true)
						.WithColor(Color.Red);
					await SendEmbedAsync(channel, embed);
					return;
				}

				// 확률 계산
				double successProb = info.Success;
				double roll = _random.NextDouble() * 100;
				bool isGreatSuccess = _random.NextDouble() * 100 <= GreatSuccessProbability;

				MessageComponent retryComponent = new ComponentBuilder()
					.WithButton("강화", "enhance_retry", ButtonStyle.Primary)
					.Build();

				MessageComponent successComponent = new ComponentBuilder()
					.WithButton("강화", "enhance_retry", ButtonStyle.Primary)
					.WithButton("판매", "sell_sword", ButtonStyle.Secondary)
					.Build();

				if (isGreatSuccess)
				{
					int increase = 3;
					int oldLevel = userSword.Level;
					userSword.Level = Math.Min(userSword.Level + increase, 15);

					(string newImg, string newName, string newType) = GetRandomWeaponImage(userSword.Level, userSword.WeaponType);
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

					EmbedBuilder embed = new EmbedBuilder()
						.WithTitle(_gameData.GetMessage(BotMessageKey.Enhance_GreatSuccess_Title))
						.WithDescription(_gameData.GetMessage(BotMessageKey.Enhance_GreatSuccess_Desc, user.Mention, userSword.Name, oldLevel, userSword.Level))
						.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Increase), $"+{userSword.Level - oldLevel}강", true)
						.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Blacksmith_Comment), $"\"{chatMsg}\"");

					if (!string.IsNullOrEmpty(lore))
					{
						embed.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Lore), $"*{lore}*");
					}

					embed.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Cost), $"{cost}원", true)
						 .AddField(_gameData.GetMessage(BotMessageKey.Enhance_RemainingBalance), $"{_gameData.UserMoney[userId]}원", true)
						 .WithColor(Color.Gold);

					await SendEmbedAsync(channel, embed, imagePath, successComponent);

					if (userSword.Level >= 10)
					{
						EmbedBuilder newsEmbed = new EmbedBuilder()
							.WithTitle(_gameData.GetMessage(BotMessageKey.Enhance_News_Huge_Title))
							.WithDescription(_gameData.GetMessage(BotMessageKey.Enhance_News_Huge_Desc, user.Username, userSword.Level, userSword.Name))
							.WithColor(Color.Purple)
							.WithThumbnailUrl(user.GetAvatarUrl() ?? user.GetDefaultAvatarUrl());

						await channel.SendMessageAsync(embed: newsEmbed.Build());
					}
				}
				else if (roll <= successProb)
				{
					userSword.Level++;
					(string newImg, string newName, string newType) = GetRandomWeaponImage(userSword.Level, userSword.WeaponType);
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

					EmbedBuilder embed = new EmbedBuilder()
						.WithTitle(_gameData.GetMessage(BotMessageKey.Enhance_Success_Title))
						.WithDescription(_gameData.GetMessage(BotMessageKey.Enhance_Success_Desc, user.Mention, userSword.Name, userSword.Level - 1, userSword.Level))
						.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Blacksmith_Comment), $"\"{chatMsg}\"");

					if (!string.IsNullOrEmpty(lore))
					{
						embed.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Lore), $"*{lore}*");
					}

					embed.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Cost), $"{cost}원", true)
						 .AddField(_gameData.GetMessage(BotMessageKey.Enhance_RemainingBalance), $"{_gameData.UserMoney[userId]}원", true)
						 .WithColor(Color.Green);

					await SendEmbedAsync(channel, embed, imagePath, successComponent);

					if (userSword.Level >= 10)
					{
						EmbedBuilder newsEmbed = new EmbedBuilder()
							.WithTitle(_gameData.GetMessage(BotMessageKey.Enhance_News_Great_Title))
							.WithDescription(_gameData.GetMessage(BotMessageKey.Enhance_News_Great_Desc, user.Username, userSword.Level, userSword.Name))
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

						EmbedBuilder embed = new EmbedBuilder()
							.WithTitle(_gameData.GetMessage(BotMessageKey.Enhance_Fail_Protected_Title))
							.WithDescription(_gameData.GetMessage(BotMessageKey.Enhance_Fail_Protected_Desc, user.Mention, userSword.Level, userSword.Name))
							.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Blacksmith_Comment), $"\"{chatMsg}\"")
							.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Cost), $"{cost}원", true)
							.AddField(_gameData.GetMessage(BotMessageKey.Enhance_RemainingBalance), $"{_gameData.UserMoney[userId]}원", true)
							.WithColor(Color.Blue);

						await SendEmbedAsync(channel, embed, maintainImagePath, successComponent);
					}
					else
					{
						userSword.Level = 0; // 파괴
											 // 파괴 시 새로운 무기 랜덤 배정 (0강)
						(string resetImg, string resetName, string resetType) = GetRandomWeaponImage(0, null);
						userSword.ImageName = resetImg;
						userSword.Name = resetName;
						userSword.WeaponType = resetType;

						ComponentBuilder builder = new ComponentBuilder()
							.WithButton("강화", "enhance_retry", ButtonStyle.Primary)
							.WithButton("위로하기", "consolation", ButtonStyle.Secondary);

						string? destroyImageName = GetRandomImage("강화_실패_");
						string? destroyImagePath = GetImagePath(destroyImageName);
						string chatMsg = GetRandomChatMessage(currentLevel + 1, "fail");

						EmbedBuilder embed = new EmbedBuilder()
							.WithTitle(_gameData.GetMessage(BotMessageKey.Enhance_Fail_Title))
							.WithDescription(_gameData.GetMessage(BotMessageKey.Enhance_Fail_Desc, user.Mention, userSword.Name))
							.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Blacksmith_Comment), $"\"{chatMsg}\"")
							.AddField(_gameData.GetMessage(BotMessageKey.Enhance_Fail_Cost), $"{cost}원", true)
							.AddField(_gameData.GetMessage(BotMessageKey.Enhance_RemainingBalance), $"{_gameData.UserMoney[userId]}원", true)
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
				await channel.SendMessageAsync(_gameData.GetMessage(BotMessageKey.Common_Busy));
				return;
			}

			_processingUsers[userId] = true;
			try
			{
				EnsureUserData(userId);

				YawnBot.Models.SwordData userSword = _gameData.UserSwords[userId];
				int currentLevel = userSword.Level;
				if (currentLevel == 0)
				{
					EmbedBuilder embed = new EmbedBuilder()
						.WithTitle(_gameData.GetMessage(BotMessageKey.Sell_NoSword_Title))
						.WithDescription(_gameData.GetMessage(BotMessageKey.Sell_NoSword_Desc))
						.WithColor(Color.Red);
					await SendEmbedAsync(channel, embed);
					return;
				}

				// 판매 가격 계산
				long basePrice = 0;
				YawnBot.Models.UpgradeInfo? info = _gameData.UpgradeInfos.FirstOrDefault(x => x.Level == currentLevel);
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
					.WithTitle(_gameData.GetMessage(BotMessageKey.Sell_Appraising_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Sell_Appraising_Desc, currentLevel, userSword.Name))
					.WithColor(Color.Orange);

				IUserMessage message = await channel.SendMessageAsync(embed: appraisalEmbed.Build());
				await Task.Delay(2000); // 2초 대기

				// 감정가 계산 (0.9 ~ 1.5 배)
				double multiplier = 0.9 + (_random.NextDouble() * 0.6);
				long finalPrice = (long)(basePrice * multiplier);

				// 1원 단위까지 랜덤 변동 추가 (-50 ~ +50)
				finalPrice += _random.Next(-50, 51);
				if (finalPrice < 0) finalPrice = 0;

				_gameData.AddMoney(userId, finalPrice);

				userSword.Level = 0; // 판매 후 초기화
				(string resetImg, string resetName, string resetType) = GetRandomWeaponImage(0, null);

				string appraisalComment = "";
				if (multiplier >= 1.3) appraisalComment = _gameData.GetMessage(BotMessageKey.Sell_Comment_Great);
				else if (multiplier <= 1.0) appraisalComment = _gameData.GetMessage(BotMessageKey.Sell_Comment_Bad);
				else appraisalComment = _gameData.GetMessage(BotMessageKey.Sell_Comment_Good);

				EmbedBuilder successEmbed = new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Sell_Complete_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Sell_Complete_Desc, finalPrice))
					.AddField(_gameData.GetMessage(BotMessageKey.Sell_BasePrice), $"{basePrice:N0}원", true)
					.AddField(_gameData.GetMessage(BotMessageKey.Sell_FinalPrice), $"{finalPrice:N0}원 ({(multiplier * 100):F0}%)", true)
					.AddField(_gameData.GetMessage(BotMessageKey.Sell_Blacksmith_Eval), $"\"{appraisalComment}\"")
					.AddField(_gameData.GetMessage(BotMessageKey.Sell_CurrentBalance), $"{_gameData.UserMoney[userId]:N0}원", true)
					.WithColor(Color.Green);

				MessageComponent component = new ComponentBuilder()
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

			YawnBot.Models.SwordData userSword = _gameData.UserSwords[userId];
			int level = userSword.Level;
			long money = _gameData.UserMoney[userId];
			int maxLevel = _gameData.UserMaxSwordLevels[userId];
			string swordName = userSword.Name ?? _gameData.GetMessage(BotMessageKey.Info_NoName);

			string? imagePath = GetImagePath(userSword.ImageName);

			EmbedBuilder embed = new EmbedBuilder()
				.WithTitle(_gameData.GetMessage(BotMessageKey.Info_Title, user.Username))
				.AddField(_gameData.GetMessage(BotMessageKey.Info_SwordName), $"**{swordName}** (+{level}강)", true)
				.AddField(_gameData.GetMessage(BotMessageKey.Info_MaxLevel), $"+{maxLevel}강", true)
				.AddField(_gameData.GetMessage(BotMessageKey.Info_Balance), $"{money}원", true)
				.WithColor(Color.Blue);

			await SendEmbedAsync(channel, embed, imagePath);
		}

		public async Task ShowMoneyAsync(IUser user, IMessageChannel channel)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);
			long money = _gameData.UserMoney[userId];

			EmbedBuilder embed = new EmbedBuilder()
				.WithTitle(_gameData.GetMessage(BotMessageKey.Money_Title))
				.WithDescription(_gameData.GetMessage(BotMessageKey.Money_Desc, user.Username, money))
				.WithColor(Color.Green);
			await SendEmbedAsync(channel, embed);
		}

		public async Task BattleAsync(IUser user, IUser targetUser, IMessageChannel channel)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			if (targetUser == null)
			{
				EmbedBuilder embed = new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Battle_TargetError_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Battle_NoTarget_Desc))
					.WithColor(Color.Orange);
				await SendEmbedAsync(channel, embed);
				return;
			}

			if (targetUser.Id == userId)
			{
				EmbedBuilder embed = new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Battle_TargetError_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Battle_Self_Desc))
					.WithColor(Color.Orange);
				await SendEmbedAsync(channel, embed);
				return;
			}

			if (targetUser.IsBot)
			{
				EmbedBuilder embed = new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Battle_TargetError_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Battle_Bot_Desc))
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
				EmbedBuilder embed = new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Battle_Limit_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Battle_Limit_Desc))
					.WithColor(Color.Red);
				await SendEmbedAsync(channel, embed);
				return;
			}

			int myLevel = _gameData.UserSwords[userId].Level;
			int targetLevel = _gameData.UserSwords[targetUser.Id].Level;
			string mySwordName = _gameData.UserSwords[userId].Name ?? _gameData.GetMessage(BotMessageKey.Info_NoName);
			string targetSwordName = _gameData.UserSwords[targetUser.Id].Name ?? _gameData.GetMessage(BotMessageKey.Info_NoName);

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

				EmbedBuilder embed = new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Battle_Win_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Battle_Win_Desc, user.Mention, targetUser.Mention))
					.AddField(_gameData.GetMessage(BotMessageKey.Battle_MySword), $"+{myLevel}강 {mySwordName}", true)
					.AddField(_gameData.GetMessage(BotMessageKey.Battle_TargetSword), $"+{targetLevel}강 {targetSwordName}", true)
					.AddField(_gameData.GetMessage(BotMessageKey.Battle_Reward), $"{reward}원", true)
					.AddField(_gameData.GetMessage(BotMessageKey.Battle_Remaining), $"{remainingBattles}회", true)
					.WithColor(Color.Green);

				await SendEmbedAsync(channel, embed, battleImagePath);
			}
			else
			{
				EmbedBuilder embed = new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Battle_Lose_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Battle_Lose_Desc, user.Mention, targetUser.Mention))
					.AddField(_gameData.GetMessage(BotMessageKey.Battle_MySword), $"+{myLevel}강 {mySwordName}", true)
					.AddField(_gameData.GetMessage(BotMessageKey.Battle_TargetSword), $"+{targetLevel}강 {targetSwordName}", true)
					.AddField(_gameData.GetMessage(BotMessageKey.Battle_Remaining), $"{remainingBattles}회", true)
					.WithColor(Color.Red);

				await SendEmbedAsync(channel, embed, battleImagePath);
			}
		}

		public async Task ShowRankingAsync(IMessageChannel channel, DiscordSocketClient client)
		{
			List<KeyValuePair<ulong, long>> sortedUsers = _gameData.UserMoney.OrderByDescending(x => x.Value).ToList();
			EmbedBuilder embed = new EmbedBuilder()
				.WithTitle(_gameData.GetMessage(BotMessageKey.Rank_Title))
				.WithColor(Color.Gold);

			int rank = 1;
			string description = "";
			foreach (var user in sortedUsers)
			{
				if (rank > 10) break; // Top 10만 표시

				ulong id = user.Key;
				var socketUser = client.GetUser(id);
				string username = socketUser?.Username ?? _gameData.GetMessage(BotMessageKey.Rank_UnknownUser);

				int currentLv = _gameData.UserSwords.ContainsKey(id) ? _gameData.UserSwords[id].Level : 0;
				int maxLv = _gameData.UserMaxSwordLevels.ContainsKey(id) ? _gameData.UserMaxSwordLevels[id] : 0;
				long money = user.Value;

				description += $"{rank}. **{username}**\n💰 {money}원 | ⚔️ 현재 +{currentLv}강 | 🌟 최대 +{maxLv}강\n\n";
				rank++;
			}

			if (sortedUsers.Count == 0)
			{
				description = _gameData.GetMessage(BotMessageKey.Rank_NoData);
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

				EmbedBuilder embed = new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Attend_Complete_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Attend_Complete_Desc, reward))
					.AddField(_gameData.GetMessage(BotMessageKey.Attend_CurrentBalance), $"{_gameData.UserMoney[userId]}원", true)
					.WithColor(Color.Green);
				await SendEmbedAsync(channel, embed);
			}
			else
			{
				TimeSpan remaining = TimeSpan.FromHours(1) - diff;
				EmbedBuilder embed = new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Attend_Wait_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Attend_Wait_Desc, remaining.Minutes, remaining.Seconds))
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

			EmbedBuilder successEmbed = new EmbedBuilder()
				.WithTitle(_gameData.GetMessage(BotMessageKey.GMM_Title))
				.WithDescription(_gameData.GetMessage(BotMessageKey.GMM_Desc))
				.AddField(_gameData.GetMessage(BotMessageKey.GMM_Amount), $"{amount}원", true)
				.AddField(_gameData.GetMessage(BotMessageKey.Attend_CurrentBalance), $"{_gameData.UserMoney[userId]}원", true)
				.WithColor(Color.Green);
			await SendEmbedAsync(channel, successEmbed);
		}


		public async Task SlotAsync(IUser user, IMessageChannel channel, long betAmount)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			if (betAmount <= 0)
			{
				await channel.SendMessageAsync(_gameData.GetMessage(BotMessageKey.Game_BetError));
				return;
			}

			if (!_gameData.TrySpendMoney(userId, betAmount))
			{
				await channel.SendMessageAsync(_gameData.GetMessage(BotMessageKey.Game_NoMoney, _gameData.UserMoney[userId]));
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
				.WithTitle(_gameData.GetMessage(BotMessageKey.Slot_Running_Title))
				.WithDescription(_gameData.GetMessage(BotMessageKey.Slot_Running_Desc))
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
			string resultMsg = _gameData.GetMessage(BotMessageKey.Slot_Lose);

			if (s1 == "7️⃣" && s2 == "7️⃣" && s3 == "7️⃣") { payout = betAmount * 77; resultMsg = _gameData.GetMessage(BotMessageKey.Slot_Jackpot); }
			else if (s1 == "💎" && s2 == "💎" && s3 == "💎") { payout = betAmount * 50; resultMsg = _gameData.GetMessage(BotMessageKey.Slot_Diamond); }
			else if (s1 == s2 && s2 == s3) { payout = betAmount * 10; resultMsg = _gameData.GetMessage(BotMessageKey.Slot_Triple); }
			else if (s1 == s2 || s2 == s3 || s1 == s3) { payout = betAmount * 2; resultMsg = _gameData.GetMessage(BotMessageKey.Slot_Double); }

			if (payout > 0)
			{
				_gameData.AddMoney(userId, payout);
			}

			embed.WithTitle(_gameData.GetMessage(BotMessageKey.Slot_Result_Title))
				.WithDescription($"**[ {s1} | {s2} | {s3} ]**\n\n{resultMsg}")
				.AddField(_gameData.GetMessage(BotMessageKey.Slot_Bet), $"{betAmount}원", true)
				.AddField(_gameData.GetMessage(BotMessageKey.Slot_Earn), $"{payout}원", true)
				.AddField(_gameData.GetMessage(BotMessageKey.Slot_Balance), $"{_gameData.UserMoney[userId]}원", true)
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
				await channel.SendMessageAsync(_gameData.GetMessage(BotMessageKey.Game_BetError));
				return;
			}

			if (!_gameData.TrySpendMoney(userId, betAmount))
			{
				await channel.SendMessageAsync(_gameData.GetMessage(BotMessageKey.Game_NoMoney, _gameData.UserMoney[userId]));
				return;
			}

			bool isOdd = _random.Next(2) == 1; // true: 홀, false: 짝
			string resultStr = isOdd ? _gameData.GetMessage(BotMessageKey.OddEven_Odd) : _gameData.GetMessage(BotMessageKey.OddEven_Even);
			bool win = (choice == _gameData.GetMessage(BotMessageKey.OddEven_Odd) && isOdd) || (choice == _gameData.GetMessage(BotMessageKey.OddEven_Even) && !isOdd);

			long payout = 0;
			if (win)
			{
				payout = betAmount * 2;
				_gameData.AddMoney(userId, payout);
			}

			var embed = new EmbedBuilder()
				.WithTitle(_gameData.GetMessage(BotMessageKey.OddEven_Title))
				.WithDescription(_gameData.GetMessage(BotMessageKey.OddEven_Result, resultStr))
				.AddField(_gameData.GetMessage(BotMessageKey.OddEven_Choice), choice, true)
				.AddField(_gameData.GetMessage(BotMessageKey.OddEven_Bet), $"{betAmount}원", true)
				.AddField(_gameData.GetMessage(BotMessageKey.OddEven_Result), win ? _gameData.GetMessage(BotMessageKey.OddEven_Win, payout) : _gameData.GetMessage(BotMessageKey.OddEven_Lose), true)
				.WithColor(win ? Color.Green : Color.Red);

			await SendEmbedAsync(channel, embed);
		}

		public async Task RpsAsync(IUser user, IMessageChannel channel, string choice, long betAmount)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			if (betAmount <= 0)
			{
				await channel.SendMessageAsync(_gameData.GetMessage(BotMessageKey.Game_BetError));
				return;
			}

			if (!_gameData.TrySpendMoney(userId, betAmount))
			{
				await channel.SendMessageAsync(_gameData.GetMessage(BotMessageKey.Game_NoMoney, _gameData.UserMoney[userId]));
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
				resultMsg = _gameData.GetMessage(BotMessageKey.RPS_Draw);
				color = Color.Orange;
			}
			else if (result == 1) // 승리
			{
				payout = betAmount * 2;
				_gameData.AddMoney(userId, payout);
				resultMsg = _gameData.GetMessage(BotMessageKey.RPS_Win, payout);
				color = Color.Green;
			}
			else // 패배
			{
				resultMsg = _gameData.GetMessage(BotMessageKey.RPS_Lose);
				color = Color.Red;
			}

			EmbedBuilder embed = new EmbedBuilder()
				.WithTitle(_gameData.GetMessage(BotMessageKey.RPS_Title))
				.WithDescription($"**[ {choice} vs {botChoice} ]**")
				.AddField(_gameData.GetMessage(BotMessageKey.RPS_User), choice, true)
				.AddField(_gameData.GetMessage(BotMessageKey.RPS_Bot), botChoice, true)
				.AddField(_gameData.GetMessage(BotMessageKey.RPS_Result), resultMsg, true)
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
					List<string> keys = _gameData.WeaponLores.Keys.ToList();
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

				string[] files = Directory.GetFiles(weaponPath, $"{currentWeaponType}_Lv{searchLevel}_*.png");
				if (files.Length > 0)
				{
					string filePath = files[_random.Next(files.Length)];
					string fileName = Path.GetFileName(filePath);

					// 파일명 형식: {WeaponType}_Lv{Level}_{Title}_{LoreSnippet}.png
					string name = _gameData.GetMessage(BotMessageKey.Weapon_NoName);
					string namePart = Path.GetFileNameWithoutExtension(fileName);
					string[] parts = namePart.Split('_');
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

			return ($"default.png", _gameData.GetMessage(BotMessageKey.Weapon_Unknown), currentWeaponType ?? "Unknown");
		}

		public string GetWeaponLore(string weaponType, int level)
		{
			if (_gameData.WeaponLores.TryGetValue(weaponType, out var loreData))
			{
				// 레벨 0은 레벨 1의 로어를 사용
				int searchLevel = level == 0 ? 1 : level;
				WeaponStage? stage = loreData.Stages.FirstOrDefault(s => s.Level == searchLevel);
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

				string[] files = Directory.GetFiles(etcPath, $"{prefix}*.png");
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
				ChatData data = _gameData.ChatData[key];
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
