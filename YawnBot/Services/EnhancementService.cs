using Discord;
using Discord.WebSocket;
using System;
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
		private const string ImageBasePath = "Resources/img/sword";

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
				var (img, name) = GetRandomSwordImage(0);
				_gameData.UserSwords[userId] = new SwordData { Level = 0, ImageName = img, Name = name };
			}
			if (!_gameData.UserMoney.ContainsKey(userId)) _gameData.UserMoney[userId] = 100000; // 초기 자금
			if (!_gameData.UserMaxSwordLevels.ContainsKey(userId)) _gameData.UserMaxSwordLevels[userId] = 0;
		}

		public async Task EnhanceSwordAsync(IUser user, IMessageChannel channel)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			var userSword = _gameData.UserSwords[userId];
			int currentLevel = userSword.Level;

			if (currentLevel >= 20)
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
			bool isGreatSuccess = _random.NextDouble() * 100 <= 1.0; // 1% 대성공 확률

			if (isGreatSuccess)
			{
				int increase = 3;
				int oldLevel = userSword.Level;
				userSword.Level = Math.Min(userSword.Level + increase, 20);

				var (newImg, newName) = GetRandomSwordImage(userSword.Level);
				userSword.ImageName = newImg;
				userSword.Name = newName;

				if (userSword.Level > _gameData.UserMaxSwordLevels[userId])
				{
					_gameData.UserMaxSwordLevels[userId] = userSword.Level;
				}

				string imagePath = GetImagePath(userSword.ImageName);
				
				var embed = new EmbedBuilder()
					.WithTitle("🌟 대성공!!! 🌟")
					.WithDescription($"{user.Mention}님의 검이 단숨에 **+{userSword.Level}강 {userSword.Name}**(으)로 진화했습니다!")
					.AddField("상승폭", $"+{userSword.Level - oldLevel}강", true)
					.AddField("비용", $"{cost}원", true)
					.AddField("남은 돈", $"{_gameData.UserMoney[userId]}원", true)
					.WithColor(Color.Gold);

				await SendEmbedAsync(channel, embed, imagePath);
			}
			else if (roll <= successProb)
			{
				userSword.Level++;
				var (newImg, newName) = GetRandomSwordImage(userSword.Level);
				userSword.ImageName = newImg; // 레벨업 시 새로운 이미지 할당
				userSword.Name = newName;

				if (userSword.Level > _gameData.UserMaxSwordLevels[userId])
				{
					_gameData.UserMaxSwordLevels[userId] = userSword.Level;
				}

				string imagePath = GetImagePath(userSword.ImageName);
				string chatMsg = GetRandomChatMessage(userSword.Level, "success");
				
				var embed = new EmbedBuilder()
					.WithTitle("🎉 강화 성공!")
					.WithDescription($"{user.Mention}님의 검이 **+{userSword.Level}강 {userSword.Name}**(으)로 변했습니다!")
					.AddField("대장장이의 한마디", $"\"{chatMsg}\"")
					.AddField("비용", $"{cost}원", true)
					.AddField("남은 돈", $"{_gameData.UserMoney[userId]}원", true)
					.WithColor(Color.Green);

				await SendEmbedAsync(channel, embed, imagePath);
			}
			else
			{
				// 실패 시 파괴 방어 로직 (35% 확률)
				bool isProtected = _random.NextDouble() * 100 <= 35.0;

				if (isProtected)
				{
					// 유지
					string maintainImageName = GetRandomImage("bot_asset_강화_유지_");
					string maintainImagePath = GetImagePath(maintainImageName);
					string chatMsg = GetRandomChatMessage(userSword.Level, "maintain");
					
					var embed = new EmbedBuilder()
						.WithTitle("🛡️ 강화 실패... 하지만 검은 무사합니다!")
						.WithDescription($"{user.Mention}님의 검이 **+{userSword.Level}강 {userSword.Name}**(으)로 유지되었습니다.")
						.AddField("대장장이의 한마디", $"\"{chatMsg}\"")
						.AddField("비용", $"{cost}원", true)
						.AddField("남은 돈", $"{_gameData.UserMoney[userId]}원", true)
						.WithColor(Color.Blue);

					await SendEmbedAsync(channel, embed, maintainImagePath);
				}
				else
				{
					userSword.Level = 0; // 파괴
					var (resetImg, resetName) = GetRandomSwordImage(0);
					userSword.ImageName = resetImg; // 파괴 시 0강 이미지 재할당
					userSword.Name = resetName;

					var builder = new ComponentBuilder()
						.WithButton("위로하기", "consolation", ButtonStyle.Primary);

					string destroyImageName = GetRandomImage("bot_asset_강화_실패_");
					string destroyImagePath = GetImagePath(destroyImageName);
					string chatMsg = GetRandomChatMessage(currentLevel + 1, "fail");
					
					var embed = new EmbedBuilder()
						.WithTitle("💥 강화 실패...")
						.WithDescription($"{user.Mention}님의 검이 깨졌습니다...")
						.AddField("대장장이의 한마디", $"\"{chatMsg}\"")
						.AddField("비용", $"{cost}원", true)
						.AddField("남은 돈", $"{_gameData.UserMoney[userId]}원", true)
						.WithColor(Color.Red);

					await SendEmbedAsync(channel, embed, destroyImagePath, builder.Build());
				}
			}
		}

		public async Task SellSwordAsync(IUser user, IMessageChannel channel)
		{
			ulong userId = user.Id;
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

			// 랜덤 보너스 (0% ~ 20%)
			double bonusRate = _random.NextDouble() * 0.2;
			long bonus = (long)(basePrice * bonusRate);
			long finalPrice = basePrice + bonus;

			_gameData.AddMoney(userId, finalPrice);

			userSword.Level = 0; // 판매 후 초기화
			var (resetImg, resetName) = GetRandomSwordImage(0);
			userSword.ImageName = resetImg;
			userSword.Name = resetName;

			var successEmbed = new EmbedBuilder()
				.WithTitle("💰 판매 완료!")
				.WithDescription($"+{currentLevel}강 검을 팔아 **{finalPrice}원**을 벌었습니다!")
				.AddField("현재 보유 금액", $"{_gameData.UserMoney[userId]}원", true)
				.WithColor(Color.Green);
			await SendEmbedAsync(channel, successEmbed);
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

			string imagePath = GetImagePath(userSword.ImageName);
			
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

			string battleImageName = GetRandomImage("bot_asset_배틀_시작_");
			string battleImagePath = GetImagePath(battleImageName);

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

		public async Task GiveSupportFundAsync(IUser user, IMessageChannel channel)
		{
			ulong userId = user.Id;
			EnsureUserData(userId);

			ulong targetId = 332838413579321354;
			if (userId != targetId)
			{
				var embed = new EmbedBuilder()
					.WithTitle("🙅‍♂️ 대상 아님")
					.WithDescription("민생지원금 대상자가 아닙니다.")
					.WithColor(Color.Red);
				await SendEmbedAsync(channel, embed);
				return;
			}

			if (_gameData.ReceivedSupportFundUsers.ContainsKey(userId))
			{
				var embed = new EmbedBuilder()
					.WithTitle("🙅‍♂️ 지급 완료")
					.WithDescription("이미 민생지원금을 받으셨습니다! (1인 1회 한정)")
					.WithColor(Color.Red);
				await SendEmbedAsync(channel, embed);
				return;
			}

			long supportAmount = 50000000; // 5천만원
			_gameData.AddMoney(userId, supportAmount);
			_gameData.ReceivedSupportFundUsers.TryAdd(userId, true);

			var successEmbed = new EmbedBuilder()
				.WithTitle("💸 민생지원금 지급 완료!")
				.WithDescription($"{user.Mention}님에게 **{supportAmount}원**을 지급했습니다! (1회 한정)")
				.AddField("현재 보유 금액", $"{_gameData.UserMoney[userId]}원", true)
				.WithColor(Color.Green);
			await SendEmbedAsync(channel, successEmbed);
		}

		public (string ImageName, string Name) GetRandomSwordImage(int level)
		{
			try
			{
				var files = Directory.GetFiles(ImageBasePath, $"sword_lv{level}_*.png");
				if (files.Length > 0)
				{
					string filePath = files[_random.Next(files.Length)];
					string fileName = Path.GetFileName(filePath);

					// 파일명 형식: sword_lv{Level}_{Variant}_{Name}.png
					string name = "이름 없는 검";
					string namePart = Path.GetFileNameWithoutExtension(fileName);
					var parts = namePart.Split('_');
					if (parts.Length >= 4)
					{
						name = parts[3];
					}

					return (fileName, name);
				}
			}
			catch { }

			return ($"sword_lv{level}_0.png", "이름 없는 검");
		}

		public string GetRandomImage(string prefix)
		{
			try
			{
				var files = Directory.GetFiles(ImageBasePath, $"{prefix}*.png");
				if (files.Length > 0)
				{
					return Path.GetFileName(files[_random.Next(files.Length)]);
				}
			}
			catch { }
			return null;
		}

		private string GetImagePath(string imageName)
		{
			if (string.IsNullOrEmpty(imageName)) return null;
			return Path.Combine(ImageBasePath, imageName);
		}

		private string GetRandomChatMessage(int level, string type)
		{
			if (_gameData.ChatData == null) return "";

			string key = level.ToString();
			if (_gameData.ChatData.ContainsKey(key))
			{
				var data = _gameData.ChatData[key];
				List<string> list = null;

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

		public async Task SendEmbedAsync(IMessageChannel channel, EmbedBuilder embed, string imagePath = null, MessageComponent components = null)
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
