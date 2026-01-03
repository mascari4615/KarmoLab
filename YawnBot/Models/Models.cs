using System;
using System.Collections.Generic;

namespace YawnBot.Models
{
	public class BotConfig
	{
		public List<ulong> AdminIds { get; set; } = new List<ulong>();
	}

	public class UpgradeInfo
	{
		public int Level { get; set; }
		public double Success { get; set; }
		public int Cost { get; set; }
		public int SellPrice { get; set; }
	}

	public class ChatData
	{
		public List<string> success { get; set; } = new List<string>();
		public List<string> fail { get; set; } = new List<string>();
		public List<string> maintain { get; set; } = new List<string>();
	}

	public class SwordData
	{
		public int Level { get; set; }
		public string ImageName { get; set; } = string.Empty;
		public string Name { get; set; } = string.Empty;
	}

	public class DailyBattleInfo
	{
		public DateTime Date { get; set; }
		public int Count { get; set; }
	}

	public class GameState
	{
		public Dictionary<string, SwordData> UserSwords { get; set; } = new Dictionary<string, SwordData>();
		public Dictionary<string, int> UserMaxSwordLevels { get; set; } = new Dictionary<string, int>();
		public Dictionary<string, long> UserMoney { get; set; } = new Dictionary<string, long>();
		public Dictionary<string, DateTime> LastAttendance { get; set; } = new Dictionary<string, DateTime>();
		public Dictionary<string, DailyBattleInfo> DailyBattleCounts { get; set; } = new Dictionary<string, DailyBattleInfo>();
		public Dictionary<string, UserStockData> UserStocks { get; set; } = new Dictionary<string, UserStockData>();
	}

	public class RaidBoss
	{
		public string Name { get; set; } = string.Empty;
		public long MaxHp { get; set; }
		public long CurrentHp { get; set; }
		public string ImageName { get; set; } = string.Empty;
		public bool IsDead => CurrentHp <= 0;
	}

	public class RaidParticipant
	{
		public ulong UserId { get; set; }
		public string Username { get; set; } = string.Empty;
		public long TotalDamage { get; set; }
	}

	public class StockItem
	{
		public string Symbol { get; set; } = string.Empty; // 식별자 (예: DOGE)
		public string Name { get; set; } = string.Empty;   // 이름 (예: 도지코인)
		public long Price { get; set; }
		public long PreviousPrice { get; set; }
		public string Description { get; set; } = string.Empty;
	}

	public class UserStockData
	{
		public Dictionary<string, int> Stocks { get; set; } = new Dictionary<string, int>(); // Symbol -> Amount
		public Dictionary<string, double> AveragePrice { get; set; } = new Dictionary<string, double>(); // Symbol -> AvgPrice
	}
}
