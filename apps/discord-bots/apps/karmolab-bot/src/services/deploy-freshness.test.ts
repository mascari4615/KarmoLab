import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  evaluateFreshness,
  decideAlert,
  runFreshnessTick,
  lastDeployNote,
  nextDelayMin,
  startDeployFreshness,
  stopDeployFreshness,
  SITE_BUILD_INPUTS,
  type AlertMemory,
} from './deploy-freshness';

const HEAD = 'b88bb08d87b67419fa879e73657908fda68187f9';
const OLD = 'a373a0330b2ab4ec898362b979e0dc19234856a9';
const NOW = new Date('2026-08-09T12:00:00Z');

function at(minAgo: number): string {
  return new Date(NOW.getTime() - minAgo * 60_000).toISOString();
}

describe('evaluateFreshness. 사이트 파일이 진실', () => {
  it('사이트 = main 끝이면 아무리 오래돼도 신선하다 (아무도 안 민 것뿐)', () => {
    const v = evaluateFreshness({
      site: { commit: HEAD, builtAt: at(3 * 24 * 60) },
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('fresh');
    expect(v.reason).toContain('3일');
  });

  it('방금 민 것은 아직 안 올라간 게 정상. 유예 안이면 신선', () => {
    const v = evaluateFreshness({
      site: { commit: OLD, builtAt: at(8) },
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('fresh');
    expect(v.reason).toContain('올라가는 중');
  });

  it('밀 것이 있는데 유예를 넘겼으면 낡음. 이것만이 사고다', () => {
    const v = evaluateFreshness({
      site: { commit: OLD, builtAt: at(21 * 60) },
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('stale');
    expect(v.ageMin).toBe(21 * 60);
    expect(v.reason).toContain('21시간');
  });

  it('사이트가 자기 판을 못 밝히면 낡음이 아니라 못 받음. 손이 엉뚱한 데 가면 안 된다', () => {
    const v = evaluateFreshness({
      site: null,
      unreachableReason: 'HTTP 503',
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('unreachable');
    expect(v.reason).toContain('503');
  });

  it('main 끝을 못 물어봤으면 판단을 미룬다. GitHub 흔들림으로 우릴 깨우지 않는다', () => {
    const v = evaluateFreshness({
      site: { commit: OLD, builtAt: at(21 * 60) },
      headSha: null,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('fresh');
    expect(v.reason).toContain('판단을 미룬다');
  });

  it('짧은 sha 와 긴 sha 를 같은 것으로 본다', () => {
    const v = evaluateFreshness({
      site: { commit: HEAD.slice(0, 8), builtAt: at(10) },
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
    });
    expect(v.state).toBe('fresh');
  });

  it('allows a newly changed site input even when the served build is old', () => {
    const verdict = evaluateFreshness({
      site: { commit: OLD, builtAt: at(21 * 60) },
      headSha: HEAD,
      now: NOW,
      staleAfterMin: 45,
      targetChangedAt: at(5),
    });
    expect(verdict.state).toBe('fresh');
    expect(verdict.reason).toContain('올라가는 중');
  });
});

describe('decideAlert. 조용해지는 것이 이 사고의 본체', () => {
  const stale = { state: 'stale' as const, reason: '낡음', ageMin: 200 };
  const fresh = { state: 'fresh' as const, reason: '신선', ageMin: 3 };

  it('첫 tick 이 건강하면 아무 말도 안 한다', () => {
    const m: AlertMemory = { last: null, lastAlertAt: null };
    expect(decideAlert(fresh, m, NOW, 360).send).toBe(false);
  });

  it('건강 → 낡음 전이에서 한 번 알린다', () => {
    const m: AlertMemory = { last: 'fresh', lastAlertAt: null };
    const d = decideAlert(stale, m, NOW, 360);
    expect(d.send).toBe(true);
    expect(d.healthy).toBe(false);
  });

  it('낡음이 이어지는 동안은 조용, 되새김 간격이 지나면 다시 찌른다', () => {
    const m: AlertMemory = { last: 'stale', lastAlertAt: new Date(NOW.getTime() - 60 * 60_000) };
    expect(decideAlert(stale, m, NOW, 360).send).toBe(false);
    const old: AlertMemory = { last: 'stale', lastAlertAt: new Date(NOW.getTime() - 400 * 60_000) };
    const d = decideAlert(stale, old, NOW, 360);
    expect(d.send).toBe(true);
    expect(d.reason).toContain('(계속)');
  });

  it('복구는 한 번만 알린다', () => {
    const m: AlertMemory = { last: 'stale', lastAlertAt: NOW };
    expect(decideAlert(fresh, m, NOW, 360)).toMatchObject({ send: true, healthy: true });
    const after: AlertMemory = { last: 'fresh', lastAlertAt: NOW };
    expect(decideAlert(fresh, after, NOW, 360).send).toBe(false);
  });
});

describe('runFreshnessTick. 실제 물어보기', () => {
  function fakeFetch(siteBody: unknown, headSha: string | null) {
    return vi.fn(async (url: string) => {
      if (String(url).includes('build.json')) {
        return { ok: true, json: async () => siteBody } as unknown as Response;
      }
      if (String(url).includes('/compare/')) return { ok: true, json: async () => ({ status: 'behind' }) } as Response;
      if (headSha === null) return { ok: false, status: 500 } as unknown as Response;
      return { ok: true, json: async () => [{ sha: headSha, commit: { committer: { date: at(21 * 60) } } }] } as unknown as Response;
    });
  }

  const base = {
    buildUrl: 'https://example.test/build.json',
    repo: 'o/r',
    workflow: 'pages-deploy.yml',
    inputPaths: ['site'],
    staleAfterMin: 45,
    remindMin: 360,
    now: () => NOW,
    timeoutMs: 1000,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };

  it('21시간 낡은 사이트를 잡아 알린다', async () => {
    const alert = vi.fn();
    const memory: AlertMemory = { last: 'fresh', lastAlertAt: null };
    const v = await runFreshnessTick(
      { ...base, fetchImpl: fakeFetch({ commit: OLD, builtAt: at(21 * 60) }, HEAD) as never, alert },
      memory,
    );
    expect(v.state).toBe('stale');
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ healthy: false, state: 'stale', siteCommit: OLD, headCommit: HEAD }));
  });

  it('reads the assembled site sha and reports the served commit', async () => {
    const alert = vi.fn();
    const verdict = await runFreshnessTick(
      { ...base, fetchImpl: fakeFetch({ sha: OLD, builtAt: at(21 * 60) }, HEAD) as never, alert },
      { last: 'fresh', lastAlertAt: null },
    );
    expect(verdict.state).toBe('stale');
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ siteCommit: OLD, headCommit: HEAD }));
  });

  it('compares with site inputs instead of unrelated bot commits', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const body = url.includes('build.json')
        ? { sha: OLD, builtAt: at(21 * 60) }
        : url.includes('/commits/main')
          ? { sha: HEAD }
          : [{ sha: OLD, commit: { committer: { date: at(21 * 60) } } }];
      return { ok: true, json: async () => body } as Response;
    });
    const verdict = await runFreshnessTick(
      { ...base, fetchImpl: fetchImpl as never },
      { last: null, lastAlertAt: null },
    );
    expect(verdict.state).toBe('fresh');
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/commits/main'))).toBe(false);
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('path=site'))).toBe(true);
  });

  it('keeps the source inputs aligned with the deployment workflow', () => {
    const workflow = readFileSync(new URL('../../../../../../.github/workflows/pages-deploy.yml', import.meta.url), 'utf8');
    const block = workflow.split('    paths:')[1].split('\n  # Allows')[0];
    const inputs = [...block.matchAll(/^\s+- ([^\r\n#]+)$/gm)].map((match) => match[1].trim().replace(/\/\*\*$/, ''));
    expect([...SITE_BUILD_INPUTS].sort()).toEqual(inputs.sort());
  });

  it('accepts a served build that already includes the latest site input', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const body = url.includes('build.json')
        ? { sha: HEAD, builtAt: at(21 * 60) }
        : url.includes('/compare/')
          ? { status: 'ahead' }
          : [{ sha: OLD, commit: { committer: { date: at(22 * 60) } } }];
      return { ok: true, json: async () => body } as Response;
    });
    const verdict = await runFreshnessTick({ ...base, fetchImpl: fetchImpl as never }, { last: null, lastAlertAt: null });
    expect(verdict.state).toBe('fresh');
    expect(fetchImpl.mock.calls.some(([url]) => url.includes(`/compare/${OLD}...${HEAD}`))).toBe(true);
  });

  it('still reports an overdue site input when no deployment run exists', async () => {
    const alert = vi.fn();
    const verdict = await runFreshnessTick(
      { ...base, fetchImpl: fakeFetch({ sha: OLD, builtAt: at(21 * 60) }, HEAD) as never, alert },
      { last: null, lastAlertAt: null },
    );
    expect(verdict.state).toBe('stale');
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ state: 'stale', headCommit: HEAD }));
  });

  it.each(['sha', 'commit'])('rejects an empty %s rather than matching every main commit', async (field) => {
    const verdict = await runFreshnessTick(
      { ...base, fetchImpl: fakeFetch({ [field]: '', builtAt: at(5) }, HEAD) as never },
      { last: null, lastAlertAt: null },
    );
    expect(verdict.state).toBe('unreachable');
  });

  it('uses the published root build marker by default', async () => {
    const fetchImpl = fakeFetch({ sha: HEAD, builtAt: at(5) }, HEAD);
    let finishTick: () => void;
    const finished = new Promise<void>((resolve) => { finishTick = resolve; });
    const tickLogged = (line: string) => {
      if (!line.includes('배포 파수꾼 켬')) finishTick();
    };
    const logger = { log: vi.fn(tickLogged), warn: vi.fn(tickLogged), error: vi.fn(tickLogged) };
    startDeployFreshness({ fetchImpl: fetchImpl as never, now: () => NOW, logger });
    try {
      await finished;
      expect(String(fetchImpl.mock.calls[0][0])).toMatch(/^https:\/\/blog\.mascari4615\.com\/build\.json\?t=\d+$/);
    } finally {
      // 다음 tick 예약까지 마친 뒤 타이머 회수.
      await Promise.resolve();
      stopDeployFreshness();
    }
  });

  it('passes HTTP 404 as structured lookup failure rather than stale deployment', async () => {
    const alert = vi.fn();
    const fetchImpl = vi.fn(async (url: string) => String(url).includes('build.json') ? { ok: false, status: 404 } : { ok: true, json: async () => ({ sha: HEAD }) });
    await runFreshnessTick({ ...base, fetchImpl: fetchImpl as never, alert }, { last: null, lastAlertAt: null });
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ healthy: false, state: 'unreachable', httpStatus: 404 }));
  });

  it('캐시에 안 속게 주소에 시각을 붙인다. 파수꾼이 옛 판을 보면 파수꾼이 아니다', async () => {
    const fetchImpl = fakeFetch({ commit: HEAD, builtAt: at(5) }, HEAD);
    await runFreshnessTick({ ...base, fetchImpl: fetchImpl as never }, { last: null, lastAlertAt: null });
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/build\.json\?t=\d+/);
  });

  it('build.json 모양이 다르면 못 받음으로 센다', async () => {
    const v = await runFreshnessTick(
      { ...base, fetchImpl: fakeFetch({ hello: 'world' }, HEAD) as never },
      { last: null, lastAlertAt: null },
    );
    expect(v.state).toBe('unreachable');
  });
});

describe('nextDelayMin. 판이 갈린 동안만 촘촘히 (Datadog adaptive polling)', () => {
  it('사이트 = main 끝이면 느슨하게', () => {
    expect(nextDelayMin({ state: 'fresh', reason: '사이트 = main 끝 abc', ageMin: 5 }, 10, 3)).toBe(10);
  });
  it('올라가는 중이면 촘촘히. 초록 전환을 10분 늦게 알 이유가 없다', () => {
    expect(nextDelayMin({ state: 'fresh', reason: '올라가는 중. ...', ageMin: 5 }, 10, 3)).toBe(3);
  });
  it('낡음, 못 받음도 촘촘히', () => {
    expect(nextDelayMin({ state: 'stale', reason: 'x', ageMin: 500 }, 10, 3)).toBe(3);
    expect(nextDelayMin({ state: 'unreachable', reason: 'x', ageMin: null }, 10, 3)).toBe(3);
  });
});

describe('lastDeployNote. 알림이 원인까지 말한다', () => {
  const ok = (body) => ({ ok: true, json: async () => body });

  it('취소된 판은 원인이 아니다. 끝까지 간 판을 본다', async () => {
    const f = vi.fn(async (url) => {
      if (String(url).includes('/runs?')) {
        return ok({
          workflow_runs: [
            { id: 1, status: 'completed', conclusion: 'cancelled' },
            { id: 2, status: 'completed', conclusion: 'failure' },
          ],
        });
      }
      return ok({ jobs: [{ name: 'build', conclusion: 'failure', steps: [{ name: 'Build KarmoLab', conclusion: 'failure' }] }] });
    });
    const note = await lastDeployNote('o/r', 'w.yml', f, 1000, undefined);
    expect(note).toContain('failure');
    expect(note).toContain('build → Build KarmoLab');
  });

  it('초록인데 사이트가 안 바뀐 경우를 따로 말한다. 오늘 실제로 그랬다', async () => {
    const f = vi.fn(async () => ok({ workflow_runs: [{ id: 9, status: 'completed', conclusion: 'success' }] }));
    const note = await lastDeployNote('o/r', 'w.yml', f, 1000, undefined);
    expect(note).toContain('초록인데');
  });

  it('못 물어보면 아무 말도 안 붙인다. 지어내면 알림을 못 믿게 된다', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 403 }));
    expect(await lastDeployNote('o/r', 'w.yml', f, 1000, undefined)).toBe('');
  });
});
