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
		public List<string> success { get; set; }
		public List<string> fail { get; set; }
		public List<string> maintain { get; set; }
	}

	public class SwordData
	{
		public int Level { get; set; }
		public string ImageName { get; set; }
		public string Name { get; set; }
	}

	public class DailyBattleInfo
	{
		public DateTime Date { get; set; }
		public int Count { get; set; }
	}

	public class GameState
	{
		public Dictionary<string, SwordData> UserSwords { get; set; }
		public Dictionary<string, int> UserMaxSwordLevels { get; set; }
		public Dictionary<string, long> UserMoney { get; set; }
		public Dictionary<string, DateTime> LastAttendance { get; set; }
		public Dictionary<string, DailyBattleInfo> DailyBattleCounts { get; set; }
		public List<string> ReceivedSupportFundUsers { get; set; }
	}
}
