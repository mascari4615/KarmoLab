/// <reference lib="dom" />
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { PKG_ROOT } from '../../paths';
import { parsePostUrl, RESET_POST_MAX_AGE_MS, type ResetPost } from './codex-reset';

export const browserSessionPath = () => path.join(PKG_ROOT, 'data', 'codex-reset-browser', 'session.json');
type BrowserSession = Awaited<ReturnType<BrowserContext['storageState']>>;
const activeBrowsers = new Set<Browser>();
let generation = 0;
export async function closeResetBrowsers(): Promise<void> {
  generation++;
  await Promise.allSettled([...activeBrowsers].map(browser => browser.close()));
}
export class ResetBrowserError extends Error {
  constructor(public code: 'login-required' | 'unavailable' | 'incomplete', message: string) { super(message); }
}

export function readBrowserSession(file = browserSessionPath()): BrowserSession {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8')) as BrowserSession;
    if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)
      || !state.cookies.some(c => c.name === 'auth_token' && /(^|\.)x\.com$/.test(c.domain.replace(/^\./, '')))) throw new Error();
    return state;
  } catch { throw new ResetBrowserError('login-required', 'X 로그인 필요. 노트북에서 npm run codex:login 실행'); }
}

export function saveBrowserSession(state: BrowserSession, file = browserSessionPath()): void {
  const onlyX: BrowserSession = {
    cookies: state.cookies.filter(c => /(^|\.)(x|twitter)\.com$/.test(c.domain.replace(/^\./, ''))),
    origins: state.origins.filter(o => /^https:\/\/([a-z0-9-]+\.)?(x|twitter)\.com$/.test(o.origin)),
  };
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(onlyX), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

interface Card { id: string; url: string; postedAt: string; pinned: boolean }

// 프로필의 답글 상대와 인용 글을 제외하고 본인 헤더의 시각 링크만 수집
export async function readTimelineCards(page: Page, author: string): Promise<Card[]> {
  return page.locator('article[data-testid="tweet"]').evaluateAll((articles, name) => articles.flatMap(article => {
    const bounds = article.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= innerHeight) return [];
    const header = article.querySelector('[data-testid="User-Name"]');
    const time = header?.querySelector('time');
    const href = time?.closest('a')?.getAttribute('href') || '';
    const match = href.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)$/);
    if (!match || match[1].toLowerCase() !== name.toLowerCase()) return [];
    return [{ id: match[2], url: `https://x.com${href}`, postedAt: time!.getAttribute('datetime') || '',
      pinned: /Pinned|고정/i.test(article.querySelector('[data-testid="socialContext"]')?.textContent || '') }];
  }), author);
}

async function requireTimeline(page: Page): Promise<void> {
  try {
    await page.waitForFunction(() => !!document.querySelector('article[data-testid="tweet"]')
      || /\/i\/(flow\/login|account\/access)/.test(location.pathname), undefined, { timeout: 20_000 });
  } catch {
    if (await page.getByRole('link', { name: /^(Log in|로그인)$/i }).count()) throw new ResetBrowserError('login-required', 'X 로그인 만료. 노트북에서 다시 로그인 필요');
    throw new ResetBrowserError('unavailable', 'X 게시물 로딩 실패. 마지막 수집 위치 유지');
  }
  if (/\/i\/(flow\/login|account\/access)/.test(new URL(page.url()).pathname)) throw new ResetBrowserError('login-required', 'X 로그인 또는 계정 확인 필요');
}

export async function discoverBrowserPosts(page: Page, author: string, sinceId?: string): Promise<Card[]> {
  await page.goto(`https://x.com/${author}/with_replies`, { waitUntil: 'domcontentloaded' });
  await requireTimeline(page);
  const found = new Map<string, Card>();
  // 장기 장애 후에도 발송 가능한 최근 24시간부터 복구. 과거 cursor 때문에 영구 정지 방지
  const cutoff = Date.now() - RESET_POST_MAX_AGE_MS;
  const isPending = (card: Card) => !sinceId || (BigInt(card.id) > BigInt(sinceId) && Date.parse(card.postedAt) >= cutoff);
  let crossed = false;
  let olderScreens = 0;
  let previous = '';
  for (let scroll = 0; scroll < 40; scroll++) {
    const cards = await readTimelineCards(page, author);
    for (const card of cards) {
      if (!Number.isFinite(Date.parse(card.postedAt))) throw new ResetBrowserError('incomplete', 'X 게시 시각 확인 실패');
      if (isPending(card)) found.set(card.id, card);
    }
    const older = cards.some(c => !c.pinned && !isPending(c));
    const newer = cards.some(c => !c.pinned && isPending(c));
    crossed ||= older;
    // 답글 묶음과 고정 글의 역순 배치 때문에 첫 과거 글에서 중단 금지
    olderScreens = crossed && older && !newer ? olderScreens + 1 : 0;
    if (sinceId && olderScreens >= 2) return [...found.values()];
    if (!sinceId && (found.size >= 20 || (scroll >= 5 && found.size > 0))) {
      return [...found.values()].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, 20);
    }
    if (found.size > 100) throw new ResetBrowserError('incomplete', 'X 새 글 100건 초과. 마지막 수집 위치 유지');
    const signature = cards.map(c => c.id).join(',') + ':' + await page.evaluate(() => scrollY);
    if (scroll > 0 && signature === previous) throw new ResetBrowserError('incomplete', 'X 타임라인 추가 로딩 실패. 마지막 수집 위치 유지');
    previous = signature;
    await page.mouse.wheel(0, await page.evaluate(() => Math.floor(innerHeight * 0.8)));
    await page.waitForTimeout(1_000);
    await requireTimeline(page);
  }
  throw new ResetBrowserError('incomplete', 'X 이전 수집 위치까지 읽지 못함. 마지막 수집 위치 유지');
}

export async function readBrowserContext(page: Page, targetId: string): Promise<NonNullable<ResetPost['context']>> {
  // 본문보다 늦게 도착하는 답글 대기. 부모만 먼저 뜬 상태를 완성된 문맥으로 저장하지 않음
  try {
    await page.waitForFunction(id => {
      const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
      const target = articles.findIndex(article => [...article.querySelectorAll('a[href] time')].some(time =>
        !time.closest('[role="link"]:not(a)') && time.closest('a')?.getAttribute('href')?.endsWith(`/status/${id}`)));
      return target >= 0 && articles.slice(target + 1).some(article => {
        if (/Promoted|광고/.test(article.querySelector('[data-testid="socialContext"]')?.textContent || '')) return false;
        const href = article.querySelector('[data-testid="User-Name"] a[href] time')?.closest('a')?.getAttribute('href') || '';
        return /^\/[A-Za-z0-9_]+\/status\/\d+$/.test(href)
          && [...article.querySelectorAll('[data-testid="tweetText"]')].some(text => !text.closest('[role="link"]'));
      });
    }, targetId, { timeout: 8_000 });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;
    // 실제로 답글이 없는 글도 존재. 대기 종료 후 현재 부모/답글만 수집
  }
  const read = () => page.locator('article[data-testid="tweet"]').evaluateAll((articles, id) => {
    // 상세 화면의 대상 시각은 User-Name 헤더 밖에 있음. 대상 경계와 주변 글 헤더를 따로 선택
    const targetIndex = articles.findIndex(article => [...article.querySelectorAll('a[href] time')].some(time =>
      !time.closest('[role="link"]:not(a)') && time.closest('a')?.getAttribute('href')?.endsWith(`/status/${id}`)));
    if (targetIndex < 0) return [];
    const rows = articles.flatMap((article, index) => {
      // 일반 영상에도 placementTracking이 있으므로 광고 판정에는 표시된 광고 문구만 사용
      if (/Promoted|광고/.test(article.querySelector('[data-testid="socialContext"]')?.textContent || '')) return [];
      const time = article.querySelector('[data-testid="User-Name"] a[href] time');
      const match = time?.closest('a')?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)$/);
      const text = [...article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]')].find(n => !n.closest('[role="link"]'));
      if (!match || !text) return [];
      const copy = text.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('img').forEach(img => img.replaceWith(img.alt));
      const needsOriginal = [...article.querySelectorAll('button:not([role="link"] button)')]
        .some(button => /^(Show original|View original|원본 보기)$/i.test(button.textContent?.trim() || ''));
      return [{ id: match[2], author: match[1], text: (copy.textContent || '').slice(0, 1600), index, needsOriginal }];
    });
    return [...rows.filter(r => r.index < targetIndex).slice(-2).map(r => ({ ...r, relation: 'parent' as const })),
      ...rows.filter(r => r.index > targetIndex).slice(0, 8).map(r => ({ ...r, relation: 'reply' as const }))];
  }, targetId);
  // 부모 글과 주변 답글의 번역을 원본으로 전환. 작성자와 글 ID를 함께 고정
  const rows = await read();
  for (const row of rows) {
    const article = page.locator('article[data-testid="tweet"]').filter({ has: page.locator(`[data-testid="User-Name"] a[href="/${row.author}/status/${row.id}"] time`) });
    if (!(await article.count())) {
      if (row.needsOriginal) throw new ResetBrowserError('incomplete', `X 문맥 원본 확인 실패 (${row.id})`);
      continue;
    }
    const original = article.locator('button:not([role="link"] button)').filter({ hasText: /^(Show original|View original|원본 보기)$/i }).first();
    if (await original.count()) { await original.click(); await original.waitFor({ state: 'hidden' }); }
    row.text = await article.evaluate(element => {
      const text = [...element.querySelectorAll('[data-testid="tweetText"]')].find(n => !n.closest('[role="link"]'));
      const copy = text?.cloneNode(true) as HTMLElement | undefined;
      copy?.querySelectorAll('img').forEach(img => img.replaceWith(img.alt));
      return (copy?.textContent || '').slice(0, 1600);
    });
  }
  // 원본 전환 중 가상 스크롤로 대상 본문이 사라져도 최초에 확인한 관계 유지
  return rows.map(({ index: _index, needsOriginal: _needsOriginal, ...row }) => row);
}

export async function readBrowserPost(page: Page, card: Pick<Card, 'id' | 'url'>, author: string, includeContext = false): Promise<ResetPost> {
  await page.goto(card.url, { waitUntil: 'domcontentloaded' });
  await requireTimeline(page);
  // 답글 화면의 부모 글과 인용 대신 요청 ID의 본문 선택. 늦게 붙는 대상도 대기
  const article = page.locator('article[data-testid="tweet"]').filter({
    has: page.locator(`a[href="/${author}/status/${card.id}" i]:not([role="link"]:not(a) a) time`),
  });
  try { await article.waitFor({ state: 'attached' }); }
  catch { throw new ResetBrowserError('incomplete', `X 대상 원문/작성자 확인 실패 (${card.id})`); }
  const original = article.locator('button:not([role="link"] button)').filter({ hasText: /^(Show original|View original|원본 보기)$/i }).first();
  if (await original.count()) {
    await original.click();
    await original.waitFor({ state: 'hidden' });
  }
  const post = await article.evaluate((element, expected) => {
    const header = element.querySelector('[data-testid="User-Name"]');
    const authorOk = [...(header?.querySelectorAll('a[href]') || [])].some(a => a.getAttribute('href')?.toLowerCase() === `/${expected.author.toLowerCase()}`);
    const time = [...element.querySelectorAll('a[href] time')].find(t => t.closest('a')?.getAttribute('href') === `/${expected.author}/status/${expected.id}`);
    const text = [...element.querySelectorAll<HTMLElement>('[data-testid="tweetText"]')].find(n => !n.closest('[role="link"]'));
    const copy = text?.cloneNode(true) as HTMLElement | undefined;
    copy?.querySelectorAll('img').forEach(img => img.replaceWith(img.alt));
    return { authorOk, postedAt: time?.getAttribute('datetime'), text: copy?.textContent || '', lang: text?.lang || '',
      truncated: [...element.querySelectorAll('[data-testid="tweet-text-show-more-link"]')].some(n => !n.closest('[role="link"]')) };
  }, { author, id: card.id });
  if (!post.authorOk || !Number.isFinite(Date.parse(post.postedAt)) || post.truncated) throw new ResetBrowserError('incomplete', `X 전체 원문/작성자/게시 시각 확인 실패 (${card.id})`);
  if (await original.count()) throw new ResetBrowserError('incomplete', 'X 원본 전환 실패. 번역문으로 판정하지 않음');
  const context = includeContext ? await readBrowserContext(page, card.id) : undefined;
  return { id: card.id, url: card.url, text: post.text, postedAt: new Date(post.postedAt).toISOString(), ...(context ? { context } : {}) };
}

export function createBrowserResetSource(author: string, sessionFile = browserSessionPath(), targetUrl?: string): (sinceId?: string) => Promise<ResetPost[]> {
  return async sinceId => {
    if (!/^[A-Za-z0-9_]{1,15}$/.test(author) || (sinceId && !/^\d{1,19}$/.test(sinceId))) throw new Error('X 작성자/수집 위치 형식 오류');
    const state = readBrowserSession(sessionFile);
    const modified = fs.statSync(sessionFile).mtimeMs;
    const current = generation;
    const channel = process.env.YAWNBOT_CODEX_RESET_BROWSER === 'chromium' ? undefined : 'msedge';
    const browser = await chromium.launch({ channel, headless: true, chromiumSandbox: true, timeout: 20_000 });
    activeBrowsers.add(browser);
    const deadline = setTimeout(() => { void browser.close(); }, 180_000);
    deadline.unref();
    let stage = '타임라인';
    try {
      if (current !== generation) throw new ResetBrowserError('unavailable', 'X 수집 종료 중');
      const context = await browser.newContext({ storageState: state, locale: 'en-US', viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.setDefaultNavigationTimeout(25_000);
      const target = targetUrl ? parsePostUrl(targetUrl) : null;
      if (target && target.author.toLowerCase() !== author.toLowerCase()) throw new Error('X 작성자 불일치');
      const cards = target ? [target] : await discoverBrowserPosts(page, author, sinceId);
      const posts: ResetPost[] = [];
      for (const card of cards) {
        stage = card.id;
        posts.push(await readBrowserPost(page, card, author, true));
      }
      stage = '인증 저장';
      // 수집 중 재로그인한 새 인증을 옛 세션으로 덮어쓰지 않음
      if (fs.statSync(sessionFile).mtimeMs === modified) saveBrowserSession(await context.storageState(), sessionFile);
      return posts.sort((a, b) => BigInt(a.id) > BigInt(b.id) ? 1 : -1);
    } catch (error) {
      if (error instanceof ResetBrowserError) throw error;
      const reason = error instanceof Error && error.name === 'TimeoutError' ? '시간 초과' : '실패';
      throw new ResetBrowserError('unavailable', `X 브라우저 수집 ${reason} (${stage}). 연결/브라우저 상태 확인 필요`);
    } finally { clearTimeout(deadline); activeBrowsers.delete(browser); await browser.close(); }
  };
}

export async function fetchBrowserResetPostLink(input: string, author: string): Promise<ResetPost> {
  const target = parsePostUrl(input);
  if (target.author.toLowerCase() !== author.toLowerCase()) throw new Error(`@${author}의 트윗 링크를 입력해 주세요.`);
  return (await createBrowserResetSource(author, browserSessionPath(), target.url)())[0];
}
