using Discord;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using KarmoLab.YawnBot.Models;

namespace KarmoLab.YawnBot.Services
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
			foreach (StockItem stock in Stocks.Values)
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

			// 가격 변동 후 저장 (GameDataService AutoSave에 맡김)
			// _gameData.SaveGameData();
		}

		public string GetChartUrl(string symbol)
		{
			if (!Stocks.ContainsKey(symbol)) return "";
			StockItem stock = Stocks[symbol];

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
						text: '{_gameData.GetMessage(BotMessageKey.Stock_Chart_Title, stock.Name, stock.Symbol)}'
					}}
				}}
			}}";

			// URL 인코딩 필요 없이 QuickChart는 JSON을 쿼리로 받음 (단, 복잡하면 인코딩 필요)
			// 간단하게 Uri.EscapeDataString 사용
			return $"https://quickchart.io/chart?c={Uri.EscapeDataString(config)}";
		}

		public EmbedBuilder GetStockListEmbed()
		{
			EmbedBuilder embed = new EmbedBuilder()
				.WithTitle(_gameData.GetMessage(BotMessageKey.Stock_List_Title))
				.WithColor(Color.Blue)
				.WithCurrentTimestamp();

			foreach (StockItem stock in Stocks.Values)
			{
				long diff = stock.Price - stock.PreviousPrice;
				string diffStr = diff > 0 ? _gameData.GetMessage(BotMessageKey.Stock_List_Change_Up, diff, (double)diff / stock.PreviousPrice * 100) :
								 diff < 0 ? _gameData.GetMessage(BotMessageKey.Stock_List_Change_Down, diff, (double)diff / stock.PreviousPrice * 100) : _gameData.GetMessage(BotMessageKey.Stock_List_Change_None);

				embed.AddField($"{stock.Name} ({stock.Symbol})",
					_gameData.GetMessage(BotMessageKey.Stock_List_Format, stock.Price, diffStr, stock.Description), false);
			}

			return embed;
		}

		public (bool success, string message) BuyStock(ulong userId, string symbol, int amount)
		{
			if (amount <= 0) return (false, _gameData.GetMessage(BotMessageKey.Stock_Buy_AmountError));
			if (!Stocks.ContainsKey(symbol)) return (false, _gameData.GetMessage(BotMessageKey.Stock_Buy_SymbolError));

			StockItem stock = Stocks[symbol];
			long totalCost = stock.Price * amount;

			if (!_gameData.TrySpendMoney(userId, totalCost))
			{
				if (!_gameData.TrySpendMoney(userId, totalCost))
				{
					return (false, _gameData.GetMessage(BotMessageKey.Stock_Buy_MoneyError, totalCost, _gameData.UserMoney.GetValueOrDefault(userId, 0)));
				}
			}

			// 유저 주식 데이터 갱신
			if (!_gameData.UserStocks.ContainsKey(userId))
			{
				_gameData.UserStocks[userId] = new UserStockData();
			}

			UserStockData userStock = _gameData.UserStocks[userId];

			// 평단가 계산
			// (기존 보유량 * 기존 평단가 + 신규 매수량 * 매수가) / (기존 보유량 + 신규 매수량)
			int currentAmount = userStock.Stocks.GetValueOrDefault(symbol, 0);
			double currentAvg = userStock.AveragePrice.GetValueOrDefault(symbol, 0);

			double newAvg = ((currentAmount * currentAvg) + (amount * stock.Price)) / (currentAmount + amount);

			userStock.Stocks[symbol] = currentAmount + amount;
			userStock.AveragePrice[symbol] = newAvg;

			return (true, _gameData.GetMessage(BotMessageKey.Stock_Buy_Success, stock.Name, amount, stock.Price, totalCost));
		}

		public (bool success, string message) SellStock(ulong userId, string symbol, int amount)
		{
			if (amount <= 0) return (false, _gameData.GetMessage(BotMessageKey.Stock_Buy_AmountError));
			if (!Stocks.ContainsKey(symbol)) return (false, _gameData.GetMessage(BotMessageKey.Stock_Buy_SymbolError));
			if (!_gameData.UserStocks.ContainsKey(userId)) return (false, _gameData.GetMessage(BotMessageKey.Stock_Sell_NoStock));

			UserStockData userStock = _gameData.UserStocks[userId];
			int currentAmount = userStock.Stocks.GetValueOrDefault(symbol, 0);

			if (currentAmount < amount)
			{
				return (false, _gameData.GetMessage(BotMessageKey.Stock_Sell_AmountError, currentAmount));
			}

			StockItem stock = Stocks[symbol];
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

			return (true, _gameData.GetMessage(BotMessageKey.Stock_Sell_Success, stock.Name, amount, stock.Price, totalIncome, profitStr));
		}

		public EmbedBuilder GetMyStockEmbed(ulong userId, string username)
		{
			if (!_gameData.UserStocks.ContainsKey(userId) || _gameData.UserStocks[userId].Stocks.Count == 0)
			{
				return new EmbedBuilder()
					.WithTitle(_gameData.GetMessage(BotMessageKey.Stock_MyStock_Header, username))
					.WithDescription(_gameData.GetMessage(BotMessageKey.Stock_MyStock_Empty))
					.WithColor(Color.DarkGrey);
			}

			UserStockData userStock = _gameData.UserStocks[userId];
			EmbedBuilder embed = new EmbedBuilder()
				.WithTitle(_gameData.GetMessage(BotMessageKey.Stock_MyStock_Header, username))
				.WithColor(Color.Green);

			long totalAssetValue = 0;
			long totalInvested = 0;

			foreach (KeyValuePair<string, int> item in userStock.Stocks)
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
						_gameData.GetMessage(BotMessageKey.Stock_MyStock_Item, avgPrice, stock.Price, profitIcon, profit, profitPercent), false);
				}
			}

			long totalProfit = totalAssetValue - totalInvested;
			double totalProfitPercent = totalInvested > 0 ? (double)totalProfit / totalInvested * 100 : 0;

			embed.WithDescription(_gameData.GetMessage(BotMessageKey.Stock_MyStock_Footer, totalInvested, totalAssetValue, totalProfit, totalProfitPercent));

			return embed;
		}
	}
}
