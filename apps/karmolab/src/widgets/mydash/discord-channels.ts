import { dashRegistry, esc } from './kit';
import type { DashPanelCtx } from './kit';

interface Channel {
  id: string; name: string; type: number | string; parentId: string | null; position: number;
  topic: string; lastMessageAt?: string | null; logicalKeys: string[];
  purpose?: string; sender?: string; state?: string; evidence?: string; webhookNames?: string[];
}
interface Guild { id: string; name: string; channels: Channel[] }
interface Report { collectedAt: string; guilds: Guild[] }
interface Guide { schema: string; measuredAt: string; guild: { id: string; name: string }; channels: Channel[] }
const PATH = 'data/discord/channels.json';
const TYPE_NAMES: Record<string, string> = { '0': '글', text: '글', '2': '음성', voice: '음성', '5': '공지', announcement: '공지', '15': '포럼', forum: '포럼', '13': '스테이지', stage: '스테이지', '16': '미디어', media: '미디어' };
const typeName = (type: Channel['type']): string => TYPE_NAMES[String(type)] || '기타';
const category = (channel: Channel): boolean => channel.type === 4 || channel.type === 'category';
const atText = (value?: string | null): string => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '최근 글 미확인';

export async function renderDiscordChannels(ctx: DashPanelCtx): Promise<void> {
  const { root } = ctx;
  let current = true;
  let generation = 0;
  ctx.onDispose(() => { current = false; generation++; });
  root.innerHTML = '<div class="dc" role="status">디코 채널 목록 불러오는 중...</div>';
  const guide = await ctx.repo.readJson<Guide>(PATH);
  if (guide.schema !== 'discord-channel-guide/1' || !Array.isArray(guide.channels)) throw new Error('채널 안내 목록 형식 오류');
  if (!current) return;
  const known = new Map(guide.channels.map(channel => [channel.id, channel]));
  let report: Report = { collectedAt: guide.measuredAt, guilds: [{ ...guide.guild, channels: guide.channels }] };
  root.innerHTML = `<div class="dc"><h2>디코 채널</h2><p>어디에 무슨 소식이 오는지, 채널 전체 목록. 이름을 누르면 디코에서 열립니다.</p><div class="dc-filter"><label>채널 찾기 <input type="search" placeholder="이름, 용도, 발신처" aria-label="채널 찾기"></label><label>분류 <select aria-label="채널 분류"><option value="">전체</option><option>운영</option><option>일상</option><option>개발용</option><option>보관</option><option>검사용</option><option>확인 필요</option></select></label><button type="button" data-refresh>새로고침</button></div><p class="dc-status" role="status"></p><p class="dc-summary"></p><div class="dc-list"></div><p class="dc-note">최근 글이 없다는 이유만으로 미사용 판정하지 않습니다. 용도 설명은 ${esc(atText(guide.measuredAt))} 기준이며, 확인하지 못한 연결은 확인 필요로 표시합니다.</p></div>`;
  const status = root.querySelector<HTMLElement>('.dc-status')!;
  const summary = root.querySelector<HTMLElement>('.dc-summary')!;
  const list = root.querySelector<HTMLElement>('.dc-list')!;
  const search = root.querySelector<HTMLInputElement>('input')!;
  const filter = root.querySelector<HTMLSelectElement>('select')!;
  const refresh = root.querySelector<HTMLButtonElement>('[data-refresh]')!;
  function paint(): void {
    const query = search.value.trim().toLocaleLowerCase();
    let total = 0, shown = 0, categoryCount = 0;
    const sections: string[] = [];
    for (const guild of report.guilds) {
      const categories = guild.channels.filter(category).sort((a, b) => a.position - b.position);
      categoryCount += categories.length;
      const rooms = guild.channels.filter(channel => !category(channel));
      total += rooms.length;
      const names = new Map<string, number>();
      for (const channel of rooms) { const key = `${channel.name}:${typeName(channel.type)}`; names.set(key, (names.get(key) || 0) + 1); }
      const rows = rooms.map(channel => {
        const note = known.get(channel.id) || guide.channels.find(saved => saved.logicalKeys.some(key => channel.logicalKeys.includes(key)));
        const info = { ...note, ...channel, purpose: note?.purpose || channel.topic || '용도 설명 미등록', sender: note?.sender || '발신처 미확인', state: note?.state || '확인 필요' };
        if (channel.lastMessageAt && info.state === '운영 연결, 글 없음') info.state = '운영 연결';
        return { ...info, duplicate: (names.get(`${channel.name}:${typeName(channel.type)}`) || 0) > 1 };
      }).filter(channel => (!filter.value || channel.state.includes(filter.value)) && (!query || [channel.name, channel.purpose, channel.sender, channel.state, channel.topic].join(' ').toLocaleLowerCase().includes(query)));
      shown += rows.length;
      const missingParents = [...new Set(rows.map(channel => channel.parentId).filter(id => id && !categories.some(channel => channel.id === id)))];
      const groups = [...categories.map(channel => ({ id: channel.id as string | null, name: channel.name })), ...missingParents.map(id => ({ id, name: '분류 미확인' })), { id: null, name: '카테고리 없음' }];
      for (const group of groups) {
        const items = rows.filter(channel => channel.parentId === group.id).sort((a, b) => a.position - b.position);
        if (!items.length) continue;
        sections.push(`<section class="dc-group"><h3>${esc(guild.name)} / ${esc(group.name)} <span>${items.length}개</span></h3><table><thead><tr><th scope="col">채널</th><th scope="col">용도</th><th scope="col">발신처</th><th scope="col">분류</th><th scope="col">최근 글</th></tr></thead><tbody>${items.map(channel => `<tr><td data-label="채널"><a href="https://discord.com/channels/${encodeURIComponent(guild.id)}/${encodeURIComponent(channel.id)}" target="_blank" rel="noopener noreferrer">${esc(channel.name)}</a><small>${typeName(channel.type)}${channel.duplicate ? ', 같은 이름 있음' : ''}</small></td><td data-label="용도">${esc(channel.purpose)}${channel.evidence ? `<details><summary>확인 근거</summary><small>${esc(channel.evidence)}${channel.logicalKeys.length ? `<br>설정 연결: ${esc(channel.logicalKeys.join(', '))}` : ''}${channel.webhookNames?.length ? `<br>발신 이름: ${esc(channel.webhookNames.join(', '))}` : ''}</small></details>` : ''}</td><td data-label="발신처">${esc(channel.sender)}</td><td data-label="분류">${esc(channel.state)}</td><td data-label="최근 글">${esc(atText(channel.lastMessageAt))}</td></tr>`).join('')}</tbody></table></section>`);
      }
    }
    summary.textContent = `전체 채널 ${total}개, 카테고리 ${categoryCount}개. 현재 ${shown}개 표시.`;
    ctx.setCount('discord-channels', String(total));
    list.innerHTML = sections.join('') || '<p class="dc-empty">일치하는 채널이 없습니다. 검색어와 분류를 바꿔 보세요.</p>';
  }
  async function load(): Promise<void> {
    const version = ++generation;
    refresh.disabled = true;
    status.textContent = '실제 채널 구성 확인 중...';
    try {
      const token = await ctx.ghToken();
      if (!token) throw new Error('login_required');
      const response = await fetch('https://bot.mascari4615.com/dash/discord-channels', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(String(response.status));
      const fresh = await response.json() as Report;
      if (!Array.isArray(fresh.guilds) || !fresh.collectedAt) throw new Error('invalid_report');
      if (!current || version !== generation) return;
      report = fresh;
      status.textContent = `실제 채널 구성 ${atText(report.collectedAt)} 확인. 최근 글은 마지막 메시지 생성 시각 기준.`;
      paint();
    } catch {
      if (!current || version !== generation) return;
      status.textContent = `실시간 조회 실패. ${atText(report.collectedAt)} 저장본 표시. 새로고침으로 다시 확인하세요.`;
    } finally { if (current && version === generation) refresh.disabled = false; }
  }
  search.addEventListener('input', paint);
  filter.addEventListener('change', paint);
  refresh.addEventListener('click', () => { void load(); });
  paint();
  await load();
}

dashRegistry().register({ id: 'discord-channels', title: '디코 채널', access: 'read', paths: [PATH], render: renderDiscordChannels });
