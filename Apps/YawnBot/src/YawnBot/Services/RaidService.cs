using Discord;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using KarmoLab.YawnBot.Models;

namespace KarmoLab.YawnBot.Services
{
	public class RaidService
	{
		private readonly GameDataService _gameData;
		private readonly Random _random;

		public RaidBoss? CurrentBoss { get; private set; }
		public List<RaidParticipant> Participants { get; private set; } = new();
		public bool IsRaidActive => CurrentBoss != null && !CurrentBoss.IsDead;

		public RaidService(GameDataService gameData, Random random)
		{
			_gameData = gameData;
			_random = random;
		}

		public void StartRaid(string name, long hp, string imageName = "")
		{
			CurrentBoss = new RaidBoss
			{
				Name = name,
				MaxHp = hp,
				CurrentHp = hp,
				ImageName = imageName
			};
			Participants.Clear();
		}

		public (long damage, bool isDead, bool isCritical) Attack(ulong userId, string username)
		{
			if (!IsRaidActive || CurrentBoss == null) return (0, false, false);

			// Get user sword level
			int level = 0;
			if (_gameData.UserSwords.TryGetValue(userId, out SwordData? sword))
			{
				level = sword.Level;
			}

			// Calculate damage
			// Base 100, + Level * 500, + Random(0~100)
			long damage = 100 + (level * 500) + _random.Next(101);

			// Critical hit? (10% chance, 1.5x)
			bool isCritical = _random.NextDouble() < 0.1;
			if (isCritical) damage = (long)(damage * 1.5);

			CurrentBoss.CurrentHp -= damage;
			if (CurrentBoss.CurrentHp < 0) CurrentBoss.CurrentHp = 0;

			// Record participant
			RaidParticipant? participant = Participants.FirstOrDefault(p => p.UserId == userId);
			if (participant == null)
			{
				participant = new RaidParticipant { UserId = userId, Username = username, TotalDamage = 0 };
				Participants.Add(participant);
			}
			participant.TotalDamage += damage;

			bool isDead = CurrentBoss.IsDead;

			if (isDead)
			{
				DistributeRewards();
			}

			return (damage, isDead, isCritical);
		}

		private void DistributeRewards()
		{
			foreach (RaidParticipant p in Participants)
			{
				// Reward: Damage * 0.1 gold
				long money = (long)(p.TotalDamage * 0.1);
				if (money < 100) money = 100; // Min reward
				_gameData.AddMoney(p.UserId, money);
			}
		}

		public EmbedBuilder GetStatusEmbed()
		{
			if (CurrentBoss == null)
			{
				return new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Raid_NoRaid_Title))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Raid_NoRaid_Desc))
					.WithColor(Color.DarkGrey);
			}

			EmbedBuilder embed = new EmbedBuilder()
				.WithTitle(_gameData.GetMessage(BotMessageKey.Raid_Status_Title, CurrentBoss.Name))
				.WithDescription(_gameData.GetMessage(BotMessageKey.Raid_Status_Desc, CurrentBoss.CurrentHp, CurrentBoss.MaxHp, (double)CurrentBoss.CurrentHp / CurrentBoss.MaxHp * 100))
				.WithColor(CurrentBoss.IsDead ? Color.DarkRed : Color.Red);

			if (CurrentBoss.IsDead)
			{
				if (CurrentBoss.IsDead)
				{
					embed.WithTitle(_gameData.GetMessage(BotMessageKey.Raid_Clean_Title, CurrentBoss.Name));
					embed.WithDescription(_gameData.GetMessage(BotMessageKey.Raid_Clean_Desc));
				}
			}

			// Top 3 Damage Dealers
			List<RaidParticipant> topDealers = Participants.OrderByDescending(p => p.TotalDamage).Take(5).ToList();
			if (topDealers.Count > 0)
			{
				string ranking = "";
				for (int i = 0; i < topDealers.Count; i++)
				{
					ranking += _gameData.GetMessage(BotMessageKey.Raid_Ranking_Format, i + 1, topDealers[i].Username, topDealers[i].TotalDamage);
				}
				embed.AddField(_gameData.GetMessage(BotMessageKey.Raid_Ranking_Title), ranking);
			}

			return embed;
		}
	}
}
