using Discord;
using Discord.Interactions;
using System.Threading.Tasks;
using YawnBot.Services;

namespace YawnBot.Modules
{
	public class RaidModule : InteractionModuleBase<SocketInteractionContext>
	{
		private readonly RaidService _raidService;
		private readonly ConfigService _configService;

		public RaidModule(RaidService raidService, ConfigService configService)
		{
			_raidService = raidService;
			_configService = configService;
		}

		[SlashCommand("레이드소환", "레이드 보스를 소환합니다. (관리자 전용)")]
		public async Task SpawnRaidAsync(string name, long hp)
		{
			if (!_configService.IsAdmin(Context.User.Id))
			{
				await RespondAsync("관리자만 사용할 수 있습니다.", ephemeral: true);
				return;
			}

			if (_raidService.IsRaidActive)
			{
				await RespondAsync("이미 진행 중인 레이드가 있습니다!", ephemeral: true);
				return;
			}

			_raidService.StartRaid(name, hp);
			
			var embed = new EmbedBuilder()
				.WithTitle("📢 레이드 보스 출현!")
				.WithDescription($"**{name}**가 나타났습니다!\n체력: {hp}\n`/공격` 명령어로 처치하세요!")
				.WithColor(Color.Red);
			
			await RespondAsync(embed: embed.Build());
		}

		[SlashCommand("공격", "레이드 보스를 공격합니다.")]
		public async Task AttackAsync()
		{
			if (!_raidService.IsRaidActive)
			{
				await RespondAsync("현재 진행 중인 레이드가 없습니다.", ephemeral: true);
				return;
			}

			var (damage, isDead, isCritical) = _raidService.Attack(Context.User.Id, Context.User.Username);
			
			string critMsg = isCritical ? " **(치명타!)**" : "";
			string msg = $"⚔️ **{Context.User.Username}**님이 **{damage}**의 데미지를 입혔습니다!{critMsg}";

			if (isDead)
			{
				msg += "\n\n💀 **보스가 처치되었습니다!**";
				var embed = _raidService.GetStatusEmbed();
				await RespondAsync(msg, embed: embed.Build());
			}
			else
			{
				var boss = _raidService.CurrentBoss;
				if (boss != null)
				{
					msg += $"\n남은 체력: {boss.CurrentHp} / {boss.MaxHp}";
				}
				await RespondAsync(msg);
			}
		}

		[SlashCommand("레이드정보", "현재 레이드 정보를 확인합니다.")]
		public async Task RaidInfoAsync()
		{
			var embed = _raidService.GetStatusEmbed();
			await RespondAsync(embed: embed.Build());
		}
	}
}
