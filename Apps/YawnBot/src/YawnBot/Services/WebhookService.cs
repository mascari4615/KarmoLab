using Discord;
using Discord.WebSocket;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using KarmoLab.YawnBot.Models;

namespace KarmoLab.YawnBot.Services
{
	public class WebhookService
	{
		public static async Task<IResult> ProcessGitHubWebhookAsync(HttpContext context, [FromServices] DiscordSocketClient client, [FromServices] GameDataService gameData)
		{
			try
			{
				GitHubPayload? payload = await context.Request.ReadFromJsonAsync<GitHubPayload>();
				if (payload == null) return Results.BadRequest();

				string eventName = context.Request.Headers["X-GitHub-Event"].ToString();
				Console.WriteLine($"[Webhook] Received: {eventName}");

				string? channelIdEnv = Environment.GetEnvironmentVariable("GITHUB_WEBHOOK_CHANNEL_ID");
				if (!ulong.TryParse(channelIdEnv, out ulong channelId))
				{
					Console.WriteLine("[Webhook] Error: GITHUB_WEBHOOK_CHANNEL_ID not set or invalid.");
					return Results.Ok();
				}

				IMessageChannel? channel = await client.GetChannelAsync(channelId) as IMessageChannel;
				if (channel == null)
				{
					Console.WriteLine($"[Webhook] Error: Channel {channelId} not found.");
					return Results.Ok();
				}

				EmbedBuilder? embed = CreateWebhookEmbed(eventName, payload, gameData);
				if (embed != null)
				{
					await channel.SendMessageAsync(embed: embed.Build());
				}

				return Results.Ok();
			}
			catch (Exception ex)
			{
				Console.WriteLine($"[Webhook] Processing failed: {ex.Message}");
				return Results.Problem();
			}
		}

		private static EmbedBuilder? CreateWebhookEmbed(string eventName, GitHubPayload payload, GameDataService gameData)
		{
			EmbedBuilder embed = new EmbedBuilder()
				.WithAuthor(payload.sender.login, payload.sender.avatar_url)
				.WithColor(Color.Green)
				.WithFooter(payload.repository.full_name)
				.WithTimestamp(DateTimeOffset.Now);

			switch (eventName)
			{
				case "ping":
					embed.WithTitle(gameData.GetMessage(BotMessageKey.Webhook_Ping_Title))
						 .WithDescription(gameData.GetMessage(BotMessageKey.Webhook_Ping_Desc));
					return embed;

				case "push":
					if (payload.commits == null || payload.commits.Count == 0) return null;
					embed.WithTitle(gameData.GetMessage(BotMessageKey.Webhook_Push_Title, payload.commits.Count));
					foreach (GitHubCommit commit in payload.commits.Take(5))
					{
						embed.Description += $"- [`{commit.id[..7]}`]({commit.url}) {commit.message}\n";
					}
					return embed;

				case "issues":
					embed.WithTitle(gameData.GetMessage(BotMessageKey.Webhook_Issue_Title, payload.issue?.number, payload.action))
						 .WithDescription(gameData.GetMessage(BotMessageKey.Webhook_Issue_Desc, payload.issue?.title, payload.issue?.html_url))
						 .WithColor(payload.action == "opened" ? Color.Orange : Color.Blue);
					return embed;

				default:
					return null;
			}
		}
	}
}
