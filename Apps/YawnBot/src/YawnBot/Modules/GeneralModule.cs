using Discord;
using Discord.Interactions;
using Discord.WebSocket;
using System.Threading.Tasks;
using System.Collections.Generic;

using KarmoLab.YawnBot.Models;

namespace KarmoLab.YawnBot.Modules
{
	public class GeneralModule : InteractionModuleBase<SocketInteractionContext>
	{
		public KarmoLab.YawnBot.Services.GameDataService GameData { get; set; } = null!;
		[SlashCommand("ping", "봇 생존 확인!")]
		public async Task PingAsync()
		{
			Embed embed = new EmbedBuilder()
				.WithTitle(GameData.GetMessage(BotMessageKey.General_Ping_Title))
				.WithDescription(GameData.GetMessage(BotMessageKey.General_Ping_Desc, Context.Client.Latency))
				.WithColor(Color.Green)
				.Build();
			await RespondAsync(embed: embed);
		}

		[SlashCommand("도움말", "도움말을 출력합니다.")]
		public async Task HelpAsync()
		{
			await ShowHelpPageAsync(0);
		}

		[ComponentInteraction("help_page:*")]
		public async Task HandleHelpPageAsync(string pageIndexStr)
		{
			if (int.TryParse(pageIndexStr, out int pageIndex))
			{
				await ShowHelpPageAsync(pageIndex, true);
			}
		}

		private async Task ShowHelpPageAsync(int pageIndex, bool isUpdate = false)
		{
			List<(string Title, string Description, string Content)> pages = GetHelpPages();
			if (pageIndex < 0) pageIndex = 0;
			if (pageIndex >= pages.Count) pageIndex = pages.Count - 1;

			(string Title, string Description, string Content) page = pages[pageIndex];
			Embed embed = new EmbedBuilder()
				.WithTitle(GameData.GetMessage(BotMessageKey.General_Help_Title, pageIndex + 1, pages.Count))
				.WithDescription(page.Description)
				.AddField(page.Title, page.Content)
				.WithColor(Color.Blue)
				.Build();

			MessageComponent components = new ComponentBuilder()
				.WithButton(GameData.GetMessage(BotMessageKey.General_Help_Prev), $"help_page:{pageIndex - 1}", ButtonStyle.Primary, disabled: pageIndex == 0)
				.WithButton(GameData.GetMessage(BotMessageKey.General_Help_Next), $"help_page:{pageIndex + 1}", ButtonStyle.Primary, disabled: pageIndex == pages.Count - 1)
				.Build();

			if (isUpdate && Context.Interaction is SocketMessageComponent component)
			{
				await component.UpdateAsync(msg =>
				{
					msg.Embed = embed;
					msg.Components = components;
				});
			}
			else
			{
				await RespondAsync(embed: embed, components: components);
			}
		}

		private List<(string Title, string Description, string Content)> GetHelpPages()
		{
			return new List<(string, string, string)>
			{
				(GameData.GetMessage(BotMessageKey.Help_Basic_Title), GameData.GetMessage(BotMessageKey.Help_Basic_Desc), GameData.GetMessage(BotMessageKey.Help_Basic_Content)),
				(GameData.GetMessage(BotMessageKey.Help_MiniGame_Title), GameData.GetMessage(BotMessageKey.Help_MiniGame_Desc), GameData.GetMessage(BotMessageKey.Help_MiniGame_Content)),
				(GameData.GetMessage(BotMessageKey.Help_Stock_Title), GameData.GetMessage(BotMessageKey.Help_Stock_Desc), GameData.GetMessage(BotMessageKey.Help_Stock_Content)),
				(GameData.GetMessage(BotMessageKey.Help_Raid_Title), GameData.GetMessage(BotMessageKey.Help_Raid_Desc), GameData.GetMessage(BotMessageKey.Help_Raid_Content))
			};
		}
	}
}
