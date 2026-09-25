import { EmbedBuilder, type Client } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { createHash } from 'node:crypto';
import { PKG_ROOT } from '../../paths';
import type { StateStore } from './state-store';
import { channelIdFor } from '../channel-provision';
import { DEFAULT_RESET_AUTHOR, RESET_POST_MAX_AGE_MS, classifyResetPost, formatKst, type ResetPost, type ResetSignal } from '../sources/codex-reset';
import { closeResetBrowsers, createBrowserResetSource } from '../sources/codex-reset-browser';
import { analyzeResetPost, resetAnalysisVersion } from '../sources/codex-reset-context';

export interface ResetState {
  author: string;
  seen: string[];
  sent: string[];
  signals: ResetSignal[];
  checkedAt: string | null;
  failureNotifiedAt?: string;
  analyzed?: Array<{ fingerprint: string; post: ResetPost; signal: ResetSignal | null }>;
}

function validPost(value: unknown): value is ResetPost {
  const p = value as ResetPost;
  return !!p && typeof p.id === 'string' && /^\d{1,19}$/.test(p.id) && typeof p.text === 'string'
    && /^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/.test(p.url) && Number.isFinite(Date.parse(p.postedAt))
    && (p.context === undefined || (Array.isArray(p.context) && p.context.length <= 10 && p.context.every(c =>
      c && typeof c.id === 'string' && /^\d{1,19}$/.test(c.id) && /^[A-Za-z0-9_]{1,15}$/.test(c.author)
      && typeof c.text === 'string' && ['parent', 'reply'].includes(c.relation))));
}

function validSignal(value: unknown): value is ResetSignal {
  const s = value as ResetSignal;
  return validPost(s?.post) && typeof s.post.id === 'string' && typeof s.post.text === 'string'
    && /^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/.test(s.post.url)
    && Number.isFinite(Date.parse(s.post.postedAt)) && ['reset', 'banked', 'both'].includes(s.kind)
    && ['completed', 'scheduled', 'uncertain'].includes(s.status)
    && (s.timing === null || (!!s.timing && Number.isFinite(Date.parse(s.timing.at)) && typeof s.timing.evidence === 'string'
      && ['around', 'within', 'by', 'exact'].includes(s.timing.qualifier)))
    && (s.analysis === undefined || (typeof s.analysis.summary === 'string' && Array.isArray(s.analysis.evidenceIds)
      && s.analysis.evidenceIds.every(id => typeof id === 'string')
      && (s.analysis.timingText === null || typeof s.analysis.timingText === 'string')
      && (s.analysis.reviews === undefined || (Array.isArray(s.analysis.reviews) && s.analysis.reviews.every(r =>
        ['claude', 'codex', 'grok'].includes(r.provider) && ['scheduled', 'completed', 'uncertain', 'unrelated', 'error'].includes(r.status) && typeof r.summary === 'string')))));
}

function emptyState(author = ''): ResetState { return { author, seen: [], sent: [], signals: [], checkedAt: null }; }

export function createResetStateStore(filePath: string): StateStore<ResetState> {
  return {
    load() {
      if (!fs.existsSync(filePath)) return emptyState();
      const p = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ResetState;
      if (!p || typeof p.author !== 'string' || !Array.isArray(p.seen) || !Array.isArray(p.sent) || !Array.isArray(p.signals)
        || !p.seen.every(x => typeof x === 'string' && /^\d{1,19}$/.test(x))
        || !p.sent.every(x => typeof x === 'string' && /^\d{1,19}$/.test(x))
        || !p.signals.every(validSignal) || (p.checkedAt !== null && !Number.isFinite(Date.parse(p.checkedAt)))
        || (p.analyzed !== undefined && (!Array.isArray(p.analyzed) || p.analyzed.length > 100 || !p.analyzed.every(a =>
          a && typeof a.fingerprint === 'string' && validPost(a.post) && (a.signal === null || validSignal(a.signal)))))) throw new Error('초기화 기록 파일 손상. 기존 파일 보존');
      return p;
    },
    save(state) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const temp = `${filePath}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(state) + '\n', 'utf8');
      fs.renameSync(temp, filePath);
    },
  };
}
const store = createResetStateStore(path.join(PKG_ROOT, 'data', 'codex-reset-state.json'));

export function buildResetEmbed(signal: ResetSignal, now = Date.now()): EmbedBuilder {
  const labels = { completed: '완료 공지', scheduled: '예정 공지', uncertain: '관련 언급, 일정 확인 필요' };
  const kind = signal.kind === 'banked' ? '저장형 초기화권' : signal.kind === 'both' ? '초기화와 저장형 초기화권' : '초기화';
  let timing = '시각 미정. 원문에 확정할 수 있는 초기화 시각 없음';
  if (signal.status === 'completed') timing = `완료를 알린 시각: ${formatKst(signal.post.postedAt)}\n계정별 적용 시각은 확인되지 않았어요.`;
  if (signal.timing) {
    const suffix = { around: '경', within: '까지 예상', by: '까지', exact: '' }[signal.timing.qualifier];
    timing = `${formatKst(signal.timing.at)}${suffix}`;
    if (Date.parse(signal.timing.at) <= now) timing += '\n공지의 예정 시각이 지났어요. 실제 적용 여부는 확인되지 않았어요.';
    if (/\bPST\b/i.test(signal.timing.evidence)) timing += '\n원문의 PST(UTC-8) 그대로 계산. 서머타임 PT를 뜻했다면 1시간 빨라요.';
  }
  const embed = new EmbedBuilder().setTitle(`Codex ${kind}: ${labels[signal.status]}`).setURL(signal.post.url)
    .setColor(signal.status === 'completed' ? 0x27ae60 : signal.status === 'scheduled' ? 0x3498db : 0x95a5a6)
    .setDescription(timing).addFields({ name: '원문', value: signal.post.text.slice(0, 1000) }, { name: '게시 시각', value: formatKst(signal.post.postedAt) })
    .setFooter({ text: '공개 트윗 기준. 내 계정 사용량과 초기화 시각은 Codex /status에서 확인' });
  if (signal.analysis) {
    embed.addFields({ name: '문맥 분석', value: signal.analysis.summary.slice(0, 500) });
    if (signal.analysis.reviews) embed.addFields({ name: 'AI별 판정', value: signal.analysis.reviews.map(r => `${r.provider}: ${r.status}\n${r.summary.slice(0, 200)}`).join('\n\n').slice(0, 1024) });
    if (signal.analysis.timingText && !signal.timing && signal.status !== 'completed') embed.setDescription(`원문 일정: ${signal.analysis.timingText}\n한국시간 미정. 원문 날짜/시간대 확인 필요`);
  }
  if (signal.kind !== 'reset') embed.addFields({ name: '저장형 초기화권', value: '직접 사용하는 초기화권 지급 소식. 지급 시각이 사용량 자동 초기화 시각은 아니에요.' });
  if (signal.post.truncated) embed.setDescription('X 임베드가 긴 글의 일부만 반환했어요. 초기화 시각과 완료 여부를 판단할 수 없어요. 원문 링크에서 전체 글을 확인해 주세요.');
  return embed;
}

export class ResetMonitor {
  private state: ResetState;
  private inFlight: Promise<ResetState> | null = null;
  constructor(private deps: { author: string; store: StateStore<ResetState>; fetchPosts: (sinceId?: string) => Promise<ResetPost[]>;
    analyze?: (post: ResetPost) => Promise<ResetSignal | null>; now?: () => number }) {
    this.state = deps.store.load();
    if (this.state.author !== deps.author) this.state = { author: deps.author, seen: [], sent: [], signals: [], checkedAt: null };
  }
  snapshot(): ResetState { return structuredClone(this.state); }
  async refresh(): Promise<ResetState> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.fetchAndRecord();
    try { return await this.inFlight; } finally { this.inFlight = null; }
  }
  private async fetchAndRecord(): Promise<ResetState> {
    const latestId = this.state.seen.reduce((max, id) => BigInt(id) > BigInt(max) ? id : max, '0');
    const now = this.deps.now?.() ?? Date.now();
    // 최근 글의 답글 맥락 변화와 옛 분류 누락도 재검사. 발송 중복 기록은 유지
    const cutoffId = ((BigInt(now - RESET_POST_MAX_AGE_MS - 1288834974657) << 22n)).toString();
    const posts = await this.deps.fetchPosts(this.deps.analyze ? cutoffId : latestId === '0' ? undefined : latestId);
    const seen = new Set(this.state.seen);
    const signals = new Map(this.state.signals.map(signal => [signal.post.id, this.deps.analyze ? signal : classifyResetPost(signal.post)]));
    const analyzed = new Map((this.state.analyzed || []).filter(a => Date.parse(a.post.postedAt) >= now - RESET_POST_MAX_AGE_MS).map(a => [a.post.id, a]));
    for (const post of posts) {
      if (!this.deps.analyze && seen.has(post.id)) continue;
      const fingerprint = createHash('sha256').update(JSON.stringify({ version: this.deps.analyze ? resetAnalysisVersion() : 'rules', text: post.text, truncated: post.truncated,
        context: [...(post.context || [])].sort((a, b) => a.id.localeCompare(b.id)) })).digest('hex');
      const cached = analyzed.get(post.id);
      const reusable = cached?.fingerprint === fingerprint && !cached.signal?.analysis?.reviews?.some(r => r.status === 'error');
      const signal = this.deps.analyze ? reusable ? cached!.signal : await this.deps.analyze(post) : classifyResetPost(post);
      signals.set(post.id, signal);
      if (this.deps.analyze) analyzed.set(post.id, { fingerprint, post, signal });
      seen.add(post.id);
    }
    const updated = { ...this.state, seen: [...seen].slice(-500), signals: [...signals.values()].filter((s): s is ResetSignal => s !== null)
      .sort((a, b) => Date.parse(a.post.postedAt) - Date.parse(b.post.postedAt)).slice(-20),
      ...(this.deps.analyze ? { analyzed: [...analyzed.values()].slice(-100) } : {}), checkedAt: new Date(now).toISOString() };
    this.deps.store.save(updated);
    this.state = updated;
    return this.snapshot();
  }
  async deliver(send: (signal: ResetSignal) => Promise<void>): Promise<number> {
    const now = this.deps.now?.() ?? Date.now();
    const pending = this.state.signals.filter(s => !this.state.sent.includes(s.post.id) && (s.status !== 'uncertain' || s.analysis?.needsReview)
      && Date.parse(s.post.postedAt) >= now - RESET_POST_MAX_AGE_MS && Date.parse(s.post.postedAt) <= now + 60_000);
    // 처음 켰을 때 과거 공지 일괄 발송 방지, 불확실한 언급보다 명확한 공지 우선
    const firstDelivery = this.state.sent.length === 0;
    const first = pending.filter(s => s.status !== 'uncertain').slice(-1)[0] || pending.slice(-1)[0];
    const selected = firstDelivery ? first ? [first] : [] : pending.slice(0, 3);
    for (const signal of selected) {
      await send(signal);
      const updated = { ...this.state, sent: [...new Set([...this.state.sent, ...(firstDelivery ? pending.map(s => s.post.id) : [signal.post.id])])].slice(-500) };
      this.deps.store.save(updated);
      this.state = updated;
    }
    return selected.length;
  }
  async reportFailure(send: () => Promise<void>): Promise<void> {
    const now = this.deps.now?.() ?? Date.now();
    if (this.state.failureNotifiedAt && now - Date.parse(this.state.failureNotifiedAt) < 6 * 3_600_000) return;
    await send();
    const updated = { ...this.state, failureNotifiedAt: new Date(now).toISOString() };
    this.deps.store.save(updated);
    this.state = updated;
  }
}

let monitor: ResetMonitor | null = null;
function getMonitor(): ResetMonitor {
  if (!monitor) {
    const author = process.env.KARMOLAB_BOT_CODEX_RESET_AUTHOR?.trim() || DEFAULT_RESET_AUTHOR;
    monitor = new ResetMonitor({ author, store, fetchPosts: createBrowserResetSource(author), analyze: analyzeResetPost });
  }
  return monitor;
}

export async function getRecentResets(force = false): Promise<{ state: ResetState; stale: boolean; error?: string }> {
  let service: ResetMonitor;
  try { service = getMonitor(); }
  catch {
    console.warn('[CodexReset] 저장 기록 읽기 실패. 파일 보존, 수집 중단');
    return { state: emptyState(process.env.KARMOLAB_BOT_CODEX_RESET_AUTHOR || DEFAULT_RESET_AUTHOR), stale: true, error: '저장 기록 손상. 기존 파일 확인 필요' };
  }
  const old = service.snapshot();
  if (!force && old.checkedAt && Date.now() - Date.parse(old.checkedAt) < 5 * 60_000) return { state: old, stale: false };
  try { return { state: await service.refresh(), stale: false }; }
  catch (error) {
    console.warn('[CodexReset] 수집 실패:', error instanceof Error ? error.message : 'unknown');
    return { state: old, stale: true, error: error instanceof Error ? error.message : 'X 수집 실패' };
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let tick: Promise<void> | null = null;
let generation = 0;

export async function triggerCodexResetOnce(client: Client): Promise<void> {
  if (tick) return tick;
  const current = generation;
  tick = (async () => {
    const result = await getRecentResets();
    if (current !== generation) return;
    const channelId = process.env.KARMOLAB_BOT_CODEX_RESET_CHANNEL_ID?.trim() || channelIdFor('ops-report');
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) throw new Error('초기화 알림 채널 접근 불가');
    if (current !== generation) return;
    if (result.stale) {
      await getMonitor().reportFailure(async () => {
        await channel.send({ embeds: [new EmbedBuilder().setTitle('Codex 초기화 소식 수집 중단').setColor(0xe67e22)
          .setDescription((result.error || 'X 수집 실패') + '\n다음 주기에 다시 확인해요. 로그인 필요 시 노트북에서 재로그인해 주세요.')
          .addFields({ name: '마지막 정상 확인', value: result.state.checkedAt ? formatKst(result.state.checkedAt) : '아직 없음' })],
          allowedMentions: { parse: [] } });
      });
      return;
    }
    const sent = await getMonitor().deliver(async signal => {
      if (current !== generation) throw new Error('초기화 알림 종료 중');
      await channel.send({ embeds: [buildResetEmbed(signal)], allowedMentions: { parse: [] }, nonce: `cr${signal.post.id}`, enforceNonce: true });
    });
    console.log(`[CodexReset] checked=${result.state.checkedAt} sent=${sent}`);
  })();
  try { await tick; } finally { tick = null; }
}

export function startCodexResetNotifier(client: Client): void {
  void stopCodexResetNotifier();
  if (process.env.KARMOLAB_BOT_CODEX_RESET_ENABLED !== '1') {
    console.log('[CodexReset] 자동 수집 비활성. /코덱스 조회 사용 가능');
    return;
  }
  const configured = Number(process.env.KARMOLAB_BOT_CODEX_RESET_INTERVAL_MIN || 60);
  const minutes = Number.isFinite(configured) ? Math.min(60, Math.max(5, configured)) : 60;
  const run = () => { void triggerCodexResetOnce(client).catch(error => console.warn('[CodexReset] 알림 실패:', error instanceof Error ? error.message : 'unknown')); };
  timer = setInterval(run, minutes * 60_000);
  timer.unref();
  console.log(`[CodexReset] 자동 수집 활성 (${minutes}분 간격)`);
  run();
}

export async function stopCodexResetNotifier(): Promise<void> {
  generation++;
  if (timer) clearInterval(timer);
  timer = null;
  await closeResetBrowsers();
}
