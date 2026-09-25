/**
 * memo-sync 순수부 + 스케줄링/freshness 회귀 (TASK-KAR-MEMOSYNC part4).
 * heartbeat.test 패턴 미러. 핵심 잠금:
 *  ① planMemoSync: fetch → local==FETCH_HEAD 면 skip / 다르면 proceed
 *  ② syncMemoOnce: skip 이면 reset 호출 X / 변경이면 reset --hard 호출
 *  ③ runMemoSyncTick 상태 전이 alert (첫 성공 무음/첫 실패 alert/전이만)
 *  ④ startMemoSync: token/memoRepoPath 미설정 = null + interval 등록 X
 *  ⑤ startMemoSync: 즉시 1회 + interval 간격 tick + stop 후 중단
 *  ⑥ ensureFresh: 최근 sync 면 skip / 오래됐으면 1회 sync (best-effort)
 *  ⑦ in-flight 직렬화: 동시 tickNow/ensureFresh = reset 중복 호출 0
 *  ⑧ getActiveMemoSyncHandle: 활성 핸들 노출 / stop 후 null
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  planMemoSync,
  syncMemoOnce,
  runMemoSyncTick,
  startMemoSync,
  stopMemoSync,
  getActiveMemoSyncHandle,
  type MemoSyncConfig,
  type GitRunner,
  type MemoSyncAlert,
  parsePorcelain,
  realEdits,
} from './memo-sync';

const CFG: MemoSyncConfig = {
  token: 'tok_x',
  memoRepoPath: '/tmp/memo',
  repoSlug: 'Mascari4615/memo',
  branch: 'main',
};
const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

/** 결정적 fake git. SHA 시퀀스, 실패 주입. */
function fakeGit(opts: {
  head: string;
  fetchHead: string;
  fetchErr?: Error;
  resetErr?: Error;
  /** tracked 미커밋 편집 경로. 기본 [] (깨끗). */
  dirty?: string[];
  spy?: { fetch?: () => void; reset?: () => void };
}): GitRunner {
  return {
    async fetch() {
      opts.spy?.fetch?.();
      if (opts.fetchErr) throw opts.fetchErr;
    },
    async headSha() {
      return opts.head;
    },
    async fetchHeadSha() {
      return opts.fetchHead;
    },
    async resetHard() {
      opts.spy?.reset?.();
      if (opts.resetErr) throw opts.resetErr;
    },
    async trackedDirty() {
      return opts.dirty ?? [];
    },
  };
}

describe('planMemoSync. fetch → skip 판정', () => {
  it('local == FETCH_HEAD → skip true (이미 최신)', async () => {
    const git = fakeGit({ head: 'abc1234567', fetchHead: 'abc1234567' });
    const plan = await planMemoSync(CFG, git);
    expect(plan.skip).toBe(true);
    expect(plan.localSha).toBe('abc1234');
    expect(plan.remoteSha).toBe('abc1234');
  });

  it('local != FETCH_HEAD → skip false (동기 필요)', async () => {
    const git = fakeGit({ head: 'aaaaaaa0000', fetchHead: 'bbbbbbb1111' });
    const plan = await planMemoSync(CFG, git);
    expect(plan.skip).toBe(false);
    expect(plan.localSha).toBe('aaaaaaa');
    expect(plan.remoteSha).toBe('bbbbbbb');
  });

  it('fetch 실패 → throw (호출부가 상태 전이로 환산)', async () => {
    const git = fakeGit({
      head: 'x',
      fetchHead: 'y',
      fetchErr: new Error('인증 실패'),
    });
    await expect(planMemoSync(CFG, git)).rejects.toThrow(/인증 실패/);
  });

  it('빈 local SHA → skip false (방어: empty == empty 가 skip 으로 새지 않음)', async () => {
    const git = fakeGit({ head: '', fetchHead: '' });
    const plan = await planMemoSync(CFG, git);
    expect(plan.skip).toBe(false);
  });
});

describe('syncMemoOnce. skip 이면 reset X / 변경이면 reset --hard', () => {
  it('skip → resetHard 호출 0', async () => {
    let resetCalls = 0;
    const git = fakeGit({
      head: 'same123456',
      fetchHead: 'same123456',
      spy: { reset: () => resetCalls++ },
    });
    const reason = await syncMemoOnce(CFG, git, silentLogger);
    expect(resetCalls).toBe(0);
    expect(reason).toContain('최신');
  });

  it('변경 → resetHard 1회', async () => {
    let resetCalls = 0;
    let fetchCalls = 0;
    const git = fakeGit({
      head: 'old1111111',
      fetchHead: 'new2222222',
      spy: { reset: () => resetCalls++, fetch: () => fetchCalls++ },
    });
    const reason = await syncMemoOnce(CFG, git, silentLogger);
    expect(fetchCalls).toBe(1);
    expect(resetCalls).toBe(1);
    expect(reason).toContain('old1111');
    expect(reason).toContain('new2222');
  });

  it('reset 실패 → throw', async () => {
    const git = fakeGit({
      head: 'old1111111',
      fetchHead: 'new2222222',
      resetErr: new Error('인덱스 잠금'),
    });
    await expect(syncMemoOnce(CFG, git, silentLogger)).rejects.toThrow(
      /인덱스 잠금/,
    );
  });

  // 2026-09-21 회귀. 개발 노트북에선 MEMO_REPO_PATH 가 공유 checkout 이라 10분마다
  // 남의 미커밋 편집을 소리 없이 지웠다 (memo lane-workspaces 2026-09-17 절).
  it('tracked 미커밋 편집 있으면 reset 0, 파일 이름을 든 오류로 멈춘다', async () => {
    let resets = 0;
    const git = fakeGit({
      head: 'old1111111',
      fetchHead: 'new2222222',
      dirty: ['scripts/realign-trunk.mjs', 'scripts/realign-trunk.test.mjs'],
      spy: { reset: () => { resets += 1; } },
    });
    await expect(syncMemoOnce(CFG, git, silentLogger)).rejects.toThrow(
      /미커밋 편집 2개 있어 reset 보류 \(scripts\/realign-trunk\.mjs, scripts\/realign-trunk\.test\.mjs\)/,
    );
    expect(resets).toBe(0);
  });

  it('dirty 목록은 5개까지만 이름, 나머지는 개수', async () => {
    const git = fakeGit({
      head: 'old1111111',
      fetchHead: 'new2222222',
      dirty: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    await expect(syncMemoOnce(CFG, git, silentLogger)).rejects.toThrow(
      /미커밋 편집 7개 있어 reset 보류 \(a, b, c, d, e 외 2\)/,
    );
  });

  it('untracked 만 있으면(dirty []) 평소처럼 reset', async () => {
    let resets = 0;
    const git = fakeGit({
      head: 'old1111111',
      fetchHead: 'new2222222',
      dirty: [],
      spy: { reset: () => { resets += 1; } },
    });
    await syncMemoOnce(CFG, git, silentLogger);
    expect(resets).toBe(1);
  });
});

describe('realEdits. 잃을 내용이 있는 편집만 센다 (2026-09-21 오탐 회귀)', () => {
  const H = (...blobs: string[]) => () => new Set(blobs);
  const none = () => new Set<string>();

  it('공유 checkout 실측: 유령 삭제 7 + 옛 커밋 그대로인 M 2 = 편집 0 (봇 되감기가 치워야 할 잔재)', () => {
    const out = [
      ' D notes/mydash/design/skill-bench/X4-calendar.html',
      ' D notes/mydash/design/skill-bench/shots/X456.png',
      ' M notes/mydash/design/skill-bench/index.html',
      ' M notes/mydash/design/tools-2026-09-20.md',
    ].join('\n');
    const entries = parsePorcelain(out);
    const disk = (p: string) => (p.endsWith('index.html') ? 'old111' : 'old222');
    const history = (p: string) => (p.endsWith('index.html') ? new Set(['new111', 'old111']) : new Set(['new222', 'old222']));
    expect(realEdits(entries, disk, history)).toEqual([]);
  });

  it('디스크 내용이 어느 이력과도 다르면 진짜 편집', () => {
    const entries = parsePorcelain(' M rules/git.md\n M README.md');
    const disk = (p: string) => (p === 'rules/git.md' ? 'mine999' : 'old222');
    const history = (p: string) => (p === 'rules/git.md' ? new Set(['a', 'b']) : new Set(['old222']));
    expect(realEdits(entries, disk, history)).toEqual(['rules/git.md']);
  });

  it('스테이지된 변경(인덱스 M/A)은 이력 대조 없이 편집으로 센다', () => {
    const entries = parsePorcelain('M  a.md\nA  b.md\nMM c.md\n D d.md');
    expect(realEdits(entries, () => 'x', H('x'))).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('디스크 blob 을 못 구한 경로는 안 센다 (읽기 실패로 되감기를 막지 않는다)', () => {
    const entries = parsePorcelain(' M a.md');
    expect(realEdits(entries, () => undefined, none)).toEqual([]);
  });

  it('parsePorcelain. 빈 출력과 꼬리 공백', () => {
    expect(parsePorcelain('')).toEqual([]);
    expect(parsePorcelain(' M a b.md \n')).toEqual([{ xy: ' M', path: 'a b.md' }]);
  });
});

describe('runMemoSyncTick. dirty 는 장애 alert 로 올라가고, 치우면 복구 alert', () => {
  it('healthy → dirty = 장애 alert 1회(파일 이름 포함), 치운 뒤 = 복구 alert', async () => {
    const alerts: MemoSyncAlert[] = [];
    const dirty = fakeGit({ head: 'a000000', fetchHead: 'b111111', dirty: ['rules/git.md'] });
    const clean = fakeGit({ head: 'a000000', fetchHead: 'b111111' });
    const deps = { alert: (e: MemoSyncAlert) => alerts.push(e), logger: silentLogger };
    const r1 = await runMemoSyncTick(CFG, true, { ...deps, git: dirty });
    expect(r1.healthy).toBe(false);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].healthy).toBe(false);
    expect(alerts[0].reason).toMatch(/rules\/git\.md/);
    const r2 = await runMemoSyncTick(CFG, false, { ...deps, git: clean });
    expect(r2.healthy).toBe(true);
    expect(alerts).toHaveLength(2);
    expect(alerts[1].healthy).toBe(true);
  });
});

describe('runMemoSyncTick. 상태 전이 alert', () => {
  const ok = () => fakeGit({ head: 'a000000', fetchHead: 'b111111' });
  const fail = () =>
    fakeGit({ head: 'x', fetchHead: 'y', fetchErr: new Error('네트워크') });

  it('첫 tick 성공(prev=null) → healthy, alert 없음', async () => {
    const alert = vi.fn();
    const r = await runMemoSyncTick(CFG, null, {
      git: ok(),
      alert,
      logger: silentLogger,
    });
    expect(r.healthy).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });

  it('첫 tick 실패(prev=null) → unhealthy, 장애 alert 1회', async () => {
    const alert = vi.fn();
    const r = await runMemoSyncTick(CFG, null, {
      git: fail(),
      alert,
      logger: silentLogger,
    });
    expect(r.healthy).toBe(false);
    expect(alert).toHaveBeenCalledWith({
      healthy: false,
      reason: expect.stringContaining('실패'),
    });
  });

  it('healthy→healthy 연속 = 무음', async () => {
    const alert = vi.fn();
    await runMemoSyncTick(CFG, true, { git: ok(), alert, logger: silentLogger });
    expect(alert).not.toHaveBeenCalled();
  });

  it('healthy→unhealthy = 장애 alert', async () => {
    const alert = vi.fn();
    const r = await runMemoSyncTick(CFG, true, {
      git: fail(),
      alert,
      logger: silentLogger,
    });
    expect(r.healthy).toBe(false);
    expect(alert).toHaveBeenCalledWith({
      healthy: false,
      reason: expect.any(String),
    });
  });

  it('unhealthy→healthy = 복구 alert', async () => {
    const alert = vi.fn();
    const r = await runMemoSyncTick(CFG, false, {
      git: ok(),
      alert,
      logger: silentLogger,
    });
    expect(r.healthy).toBe(true);
    expect(alert).toHaveBeenCalledWith({
      healthy: true,
      reason: expect.stringContaining('복구'),
    });
  });

  it('unhealthy→unhealthy 연속 = 무음', async () => {
    const alert = vi.fn();
    await runMemoSyncTick(CFG, false, {
      git: fail(),
      alert,
      logger: silentLogger,
    });
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('startMemoSync. 스케줄링 + ensureFresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    stopMemoSync();
    vi.useRealTimers();
  });

  it('token 미설정 → null + 핸들 등록 X', () => {
    const handle = startMemoSync({
      token: undefined,
      memoRepoPath: '/tmp/memo',
      logger: silentLogger,
    });
    expect(handle).toBeNull();
    expect(getActiveMemoSyncHandle()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('memoRepoPath 미설정 → null', () => {
    expect(
      startMemoSync({
        token: 'tok',
        memoRepoPath: '  ',
        logger: silentLogger,
      }),
    ).toBeNull();
  });

  it('즉시 1회 + interval 간격마다 sync (fetch 호출 카운트)', async () => {
    let fetchCalls = 0;
    const git = fakeGit({
      head: 'a000000',
      fetchHead: 'a000000',
      spy: { fetch: () => fetchCalls++ },
    });
    const handle = startMemoSync({
      token: 'tok',
      memoRepoPath: '/tmp/memo',
      intervalMin: 10,
      git,
      logger: silentLogger,
    });
    expect(handle).not.toBeNull();
    await vi.waitFor(() => expect(fetchCalls).toBe(1)); // 즉시 tick
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fetchCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fetchCalls).toBe(3);
  });

  it('intervalMin 0 → 최소 1분 clamp', async () => {
    let fetchCalls = 0;
    const git = fakeGit({
      head: 'a',
      fetchHead: 'a',
      spy: { fetch: () => fetchCalls++ },
    });
    startMemoSync({
      token: 'tok',
      memoRepoPath: '/tmp/memo',
      intervalMin: 0,
      git,
      logger: silentLogger,
    });
    await vi.waitFor(() => expect(fetchCalls).toBe(1));
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(fetchCalls).toBe(2);
  });

  it('stopMemoSync → 이후 tick 중단 + 핸들 null', async () => {
    let fetchCalls = 0;
    const git = fakeGit({
      head: 'a',
      fetchHead: 'a',
      spy: { fetch: () => fetchCalls++ },
    });
    startMemoSync({
      token: 'tok',
      memoRepoPath: '/tmp/memo',
      intervalMin: 1,
      git,
      logger: silentLogger,
    });
    await vi.waitFor(() => expect(fetchCalls).toBe(1));
    stopMemoSync();
    expect(getActiveMemoSyncHandle()).toBeNull();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchCalls).toBe(1);
  });

  it('ensureFresh: 최근 sync 면 skip / 오래되면 1회 추가 sync', async () => {
    let fetchCalls = 0;
    const git = fakeGit({
      head: 'a',
      fetchHead: 'a',
      spy: { fetch: () => fetchCalls++ },
    });
    const handle = startMemoSync({
      token: 'tok',
      memoRepoPath: '/tmp/memo',
      intervalMin: 60, // 긴 interval. ensureFresh 단독 검증
      git,
      logger: silentLogger,
    })!;
    await vi.waitFor(() => expect(fetchCalls).toBe(1)); // 즉시 tick → lastSync 갱신
    // 막 sync 했으니 maxAge=5분이면 skip
    await handle.ensureFresh(5 * 60 * 1000);
    expect(fetchCalls).toBe(1);
    // 6분 경과 → maxAge=5분 초과 → 1회 추가 sync
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    await handle.ensureFresh(5 * 60 * 1000);
    expect(fetchCalls).toBe(2);
  });

  it('동시 tickNow + ensureFresh = reset 중복 0 (in-flight 직렬화)', async () => {
    let resetCalls = 0;
    let releaseFetch: () => void = () => {};
    const git: GitRunner = {
      fetch: () =>
        new Promise<void>((resolve) => {
          releaseFetch = resolve;
        }),
      headSha: async () => 'old1111',
      fetchHeadSha: async () => 'new2222',
      resetHard: async () => {
        resetCalls++;
      },
      trackedDirty: async () => [],
    };
    const handle = startMemoSync({
      token: 'tok',
      memoRepoPath: '/tmp/memo',
      intervalMin: 60,
      git,
      logger: silentLogger,
    })!;
    // 즉시 tick 이 fetch 에서 블록 중. 그 사이 ensureFresh 동시 호출.
    const p1 = handle.ensureFresh(0); // maxAge 0 = 무조건 sync 시도
    const p2 = handle.tickNow();
    releaseFetch(); // fetch 해제 → 진행
    await Promise.all([p1, p2]);
    // 셋(즉시 tick + ensureFresh + tickNow) 이 같은 in-flight 공유 → reset 1회
    expect(resetCalls).toBe(1);
  });
});
