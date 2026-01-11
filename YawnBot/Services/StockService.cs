using Discord;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using YawnBot.Models;

namespace YawnBot.Services
{
	public class StockService
	{
		private readonly GameDataService _gameData;
		private readonly Random _random;
		private Timer? _priceUpdateTimer;
		
		public ConcurrentDictionary<string, StockItem> Stocks => _gameData.Stocks;

		public StockService(GameDataService gameData, Random random)
		{
			_gameData = gameData;
			_random = random;
			InitializeStocks();
			StartMarket();
		}

		private void InitializeStocks()
		{
			// 이미 데이터가 있으면 초기화하지 않음
			if (Stocks.Count > 0) return;

			// 초기 종목 설정
			AddStock("SAMSUNG", "떡락전자", 70000, "국민 주식. 하지만 파란불이 익숙하다.");
			AddStock("DOGE", "화성갈끄니까", 100, "도지코인. 화성 갈 수 있을까?");
			AddStock("TESLA", "테슬라", 200000, "전기차의 미래. CEO가 트윗하면 요동친다.");
			AddStock("APPLE", "사과", 150000, "감성의 사과. 튼튼하다.");
			AddStock("BITCOIN", "비트코인", 50000000, "디지털 금. 변동성이 크다.");
		}

		private void AddStock(string symbol, string name, long price, string desc)
		{
			Stocks[symbol] = new StockItem
			{
				Symbol = symbol,
				Name = name,
				Price = price,
				PreviousPrice = price,
				Description = desc,
				PriceHistory = new List<long> { price }
			};
		}

		private void StartMarket()
		{
			// 1분마다 가격 변동
			_priceUpdateTimer = new Timer(UpdatePrices, null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));
		}

		private void UpdatePrices(object? state)
		{
			foreach (var stock in Stocks.Values)
			{
				stock.PreviousPrice = stock.Price;

				// 변동폭: -5% ~ +5% (기본)
				// 가끔 대폭등/대폭락 (-20% ~ +20%)
				double changePercent;
				
				if (_random.NextDouble() < 0.05) // 5% 확률로 대변동
				{
					changePercent = (_random.NextDouble() * 0.4) - 0.2; // -0.2 ~ 0.2
				}
				else
				{
					changePercent = (_random.NextDouble() * 0.1) - 0.05; // -0.05 ~ 0.05
				}

				long changeAmount = (long)(stock.Price * changePercent);
				stock.Price += changeAmount;

				// 최소 가격 보정 (1원)
				if (stock.Price < 1) stock.Price = 1;

				// 히스토리 추가 (최대 30개 유지)
				stock.PriceHistory.Add(stock.Price);
				if (stock.PriceHistory.Count > 30)
				{
					stock.PriceHistory.RemoveAt(0);
				}
			}
			
			// 가격 변동 후 저장
			_gameData.SaveGameData();
		}

		public string GetChartUrl(string symbol)
		{
			if (!Stocks.ContainsKey(symbol)) return "";
			var stock = Stocks[symbol];
			
			if (stock.PriceHistory == null) stock.PriceHistory = new List<long> { stock.Price };

			// QuickChart.io API 사용
			string labels = string.Join(",", Enumerable.Range(1, stock.PriceHistory.Count).Select(i => $"'{i}m'"));
			string data = string.Join(",", stock.PriceHistory);
			string color = stock.Price >= stock.PreviousPrice ? "green" : "red";
			
			string config = $@"{{
				type: 'line',
				data: {{
					labels: [{labels}],
					datasets: [{{
						label: '{stock.Name}',
						data: [{data}],
						borderColor: '{color}',
						fill: false
					}}]
				}},
				options: {{
					scales: {{
						yAxes: [{{
							ticks: {{
								beginAtZero: false
							}}
						}}]
					}},
					title: {{
						display: true,
						text: '{stock.Name} ({stock.Symbol}) Price History'
					}}
				}}
			}}";

			// URL 인코딩 필요 없이 QuickChart는 JSON을 쿼리로 받음 (단, 복잡하면 인코딩 필요)
			// 간단하게 Uri.EscapeDataString 사용
			return $"https://quickchart.io/chart?c={Uri.EscapeDataString(config)}";
		}

		public EmbedBuilder GetStockListEmbed()
		{
			var embed = new EmbedBuilder()
				.WithTitle("📈 주식/코인 시세표")
				.WithColor(Color.Blue)
				.WithCurrentTimestamp();

			foreach (var stock in Stocks.Values)
			{
				long diff = stock.Price - stock.PreviousPrice;
				string diffStr = diff > 0 ? $"🔺 +{diff} ({((double)diff / stock.PreviousPrice * 100):F2}%)" : 
								 diff < 0 ? $"🔻 {diff} ({((double)diff / stock.PreviousPrice * 100):F2}%)" : "➖ 변동 없음";
				
				embed.AddField($"{stock.Name} ({stock.Symbol})", 
					$"현재가: **{stock.Price}원**\n{diffStr}\n*{stock.Description}*", false);
			}

			return embed;
		}

		public (bool success, string message) BuyStock(ulong userId, string symbol, int amount)
		{
			if (amount <= 0) return (false, "수량은 1개 이상이어야 합니다.");
			if (!Stocks.ContainsKey(symbol)) return (false, "존재하지 않는 종목입니다.");

			var stock = Stocks[symbol];
			long totalCost = stock.Price * amount;

			if (!_gameData.TrySpendMoney(userId, totalCost))
			{
				return (false, $"돈이 부족합니다. (필요: {totalCost}원, 보유: {_gameData.UserMoney.GetValueOrDefault(userId, 0)}원)");
			}

			// 유저 주식 데이터 갱신
			if (!_gameData.UserStocks.ContainsKey(userId))
			{
				_gameData.UserStocks[userId] = new UserStockData();
			}

			var userStock = _gameData.UserStocks[userId];
			
			// 평단가 계산
			// (기존 보유량 * 기존 평단가 + 신규 매수량 * 매수가) / (기존 보유량 + 신규 매수량)
			int currentAmount = userStock.Stocks.GetValueOrDefault(symbol, 0);
			double currentAvg = userStock.AveragePrice.GetValueOrDefault(symbol, 0);

			double newAvg = ((currentAmount * currentAvg) + (amount * stock.Price)) / (currentAmount + amount);

			userStock.Stocks[symbol] = currentAmount + amount;
			userStock.AveragePrice[symbol] = newAvg;

			return (true, $"{stock.Name} {amount}주를 주당 {stock.Price}원에 매수했습니다.\n총 지출: {totalCost}원");
		}

		public (bool success, string message) SellStock(ulong userId, string symbol, int amount)
		{
			if (amount <= 0) return (false, "수량은 1개 이상이어야 합니다.");
			if (!Stocks.ContainsKey(symbol)) return (false, "존재하지 않는 종목입니다.");
			if (!_gameData.UserStocks.ContainsKey(userId)) return (false, "보유한 주식이 없습니다.");

			var userStock = _gameData.UserStocks[userId];
			int currentAmount = userStock.Stocks.GetValueOrDefault(symbol, 0);

			if (currentAmount < amount)
			{
				return (false, $"보유 수량이 부족합니다. (보유: {currentAmount}주)");
			}

			var stock = Stocks[symbol];
			long totalIncome = stock.Price * amount;

			// 판매 처리
			userStock.Stocks[symbol] = currentAmount - amount;
			if (userStock.Stocks[symbol] == 0)
			{
				userStock.Stocks.Remove(symbol);
				userStock.AveragePrice.Remove(symbol);
			}

			_gameData.AddMoney(userId, totalIncome);

			// 수익률 계산 (단순 참고용)
			double avgPrice = userStock.AveragePrice.GetValueOrDefault(symbol, 0);
			long profit = totalIncome - (long)(avgPrice * amount);
			string profitStr = profit > 0 ? $"🔺 +{profit}" : profit < 0 ? $"🔻 {profit}" : "➖ 0";

			return (true, $"{stock.Name} {amount}주를 주당 {stock.Price}원에 매도했습니다.\n총 수입: {totalIncome}원 (손익: {profitStr}원)");
		}

		public EmbedBuilder GetMyStockEmbed(ulong userId, string username)
		{
			if (!_gameData.UserStocks.ContainsKey(userId) || _gameData.UserStocks[userId].Stocks.Count == 0)
			{
				return new EmbedBuilder()
					.WithTitle($"{username}님의 주식 잔고")
					.WithDescription("보유한 주식이 없습니다.")
					.WithColor(Color.DarkGrey);
			}

			var userStock = _gameData.UserStocks[userId];
			var embed = new EmbedBuilder()
				.WithTitle($"📊 {username}님의 주식 잔고")
				.WithColor(Color.Green);

			long totalAssetValue = 0;
			long totalInvested = 0;

			foreach (var item in userStock.Stocks)
			{
				string symbol = item.Key;
				int amount = item.Value;
				double avgPrice = userStock.AveragePrice[symbol];
				
				if (Stocks.TryGetValue(symbol, out var stock))
				{
					long currentValue = stock.Price * amount;
					long investedValue = (long)(avgPrice * amount);
					long profit = currentValue - investedValue;
					double profitPercent = (double)profit / investedValue * 100;

					totalAssetValue += currentValue;
					totalInvested += investedValue;

					string profitIcon = profit > 0 ? "🔺" : profit < 0 ? "🔻" : "➖";
					
					embed.AddField($"{stock.Name} ({amount}주)", 
						$"평단가: {avgPrice:F0}원 | 현재가: {stock.Price}원\n" +
						$"평가손익: {profitIcon} {profit}원 ({profitPercent:F2}%)", false);
				}
			}

			long totalProfit = totalAssetValue - totalInvested;
			double totalProfitPercent = totalInvested > 0 ? (double)totalProfit / totalInvested * 100 : 0;

			embed.WithDescription($"총 매수금액: {totalInvested}원\n총 평가금액: {totalAssetValue}원\n총 평가손익: {totalProfit}원 ({totalProfitPercent:F2}%)");

			return embed;
		}
	}
}
