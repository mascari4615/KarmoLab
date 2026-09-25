import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeResetPost } from './codex-reset-context';
import type { ResetPost } from './codex-reset';

const post: ResetPost = {
  id: '2101920928070562029', url: 'https://x.com/thsottiaux/status/2101920928070562029',
  text: '3am on a tuesday', postedAt: '2026-09-21T06:26:15Z',
  context: [
    { id: '2101792478747906307', author: 'My_Ai_Bi', relation: 'parent', text: 'the GPT-6 Community Night was 🔥' },
    { id: '2101941155973706130', author: 'SuusuuFL', relation: 'reply', text: 'Is it a banked or a reset? I need to know if I need to use all quota today.' },
  ],
};
const verdict = { kind: 'reset', status: 'scheduled', summary: '초기화 여부를 묻는 대화에서 작성자가 시간을 제시한 예정 공지', evidenceIds: [post.id, post.context![1].id], timingText: post.text };

describe('문맥 판정 경계', () => {
  beforeEach(() => vi.stubEnv('KARMOLAB_BOT_RESET_AI_PROVIDERS', 'claude,codex,grok'));
  afterEach(() => vi.unstubAllEnvs());
  it('reset 없는 실제 시간 답글을 문맥 분석에 전달하고 예정 알림으로 보존', async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify(verdict));
    const result = await analyzeResetPost(post, generate);
    expect(generate.mock.calls[0][0]).toContain('Community Night');
    expect(generate.mock.calls[0][0]).toContain('banked or a reset');
    expect(result).toMatchObject({ kind: 'reset', status: 'scheduled', timing: null, analysis: { summary: verdict.summary, timingText: post.text } });
  });
  it('다른 사람의 초기화 질문이 붙어도 무관한 글 판정 가능', async () => {
    const result = await analyzeResetPost({ ...post, text: 'Dinner at 3am on Tuesday.' }, async () => JSON.stringify({ kind: null }));
    expect(result).toBeNull();
  });
  it('명시적인 공지는 AI 없이 기존 예정 판정', async () => {
    const generate = vi.fn();
    expect(await analyzeResetPost({ ...post, text: 'We will reset Codex usage.' }, generate)).toMatchObject({ status: 'scheduled' });
    expect(generate).not.toHaveBeenCalled();
  });
  it.each([
    'not json',
    JSON.stringify({ ...verdict, status: 'invented' }),
    JSON.stringify({ ...verdict, evidenceIds: ['999999'] }),
    JSON.stringify({ ...verdict, evidenceIds: [post.context![1].id] }),
    JSON.stringify({ ...verdict, timingText: '3am PDT' }),
  ])('잘못된 AI 응답은 무관 판정으로 숨기지 않음: %s', async output => {
    await expect(analyzeResetPost(post, async () => output)).rejects.toThrow('문맥 분석');
  });
  it('AI 장애는 재시도 가능한 실패', async () => {
    await expect(analyzeResetPost(post, async () => { throw new Error('outage'); })).rejects.toThrow('문맥 분석');
  });
  it('한 제공자 실패와 두 예정 판정은 근거와 실패를 함께 표시', async () => {
    const result = await analyzeResetPost(post, async (_prompt, provider) => {
      if (provider === 'grok') throw new Error('offline');
      return JSON.stringify(verdict);
    });
    expect(result?.status).toBe('scheduled');
    expect(result?.analysis?.reviews).toContainEqual({ provider: 'grok', status: 'error', summary: '분석 실패. 로그인/사용량 확인 필요' });
  });
  it('제공자 불일치는 확인 필요, 누락시키지 않음', async () => {
    const result = await analyzeResetPost(post, async (_prompt, provider) => JSON.stringify(provider === 'claude' ? verdict : { kind: null }));
    expect(result).toMatchObject({ status: 'uncertain', analysis: { needsReview: true } });
  });
  it('실패한 제공자를 무관 표로 세지 않음', async () => {
    await expect(analyzeResetPost(post, async (_prompt, provider) => {
      if (provider === 'grok') throw new Error('offline');
      return JSON.stringify({ kind: null });
    })).rejects.toThrow('문맥 분석');
  });
});

describe('활성 AI 선택', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('Claude 단독으로 판정하고 미로그인 제공자는 호출하지 않음', async () => {
    vi.stubEnv('KARMOLAB_BOT_RESET_AI_PROVIDERS', 'claude');
    const generate = vi.fn(async (_prompt: string, provider: string) => {
      if (provider !== 'claude') throw new Error('not logged in');
      return JSON.stringify(verdict);
    });
    const result = await analyzeResetPost(post, generate);
    expect(result).toMatchObject({ status: 'scheduled', analysis: { needsReview: false } });
    expect(result?.analysis?.reviews?.map(r => r.provider)).toEqual(['claude']);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('설정이 없으면 Claude만 사용', async () => {
    vi.stubEnv('KARMOLAB_BOT_RESET_AI_PROVIDERS', undefined);
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ kind: null }));
    expect(await analyzeResetPost(post, generate)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][1]).toBe('claude');
  });
  it('선택한 Claude 실패는 다른 미로그인 AI로 넘기지 않음', async () => {
    vi.stubEnv('KARMOLAB_BOT_RESET_AI_PROVIDERS', 'claude');
    const generate = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(analyzeResetPost(post, generate)).rejects.toThrow('문맥 분석');
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('잘못된 제공자 설정은 호출 전에 실패', async () => {
    vi.stubEnv('KARMOLAB_BOT_RESET_AI_PROVIDERS', 'claude,typo');
    const generate = vi.fn().mockResolvedValue(JSON.stringify(verdict));
    await expect(analyzeResetPost(post, generate)).rejects.toThrow('문맥 분석');
    expect(generate).not.toHaveBeenCalled();
  });
  it('Claude가 불확실하다고 판정하면 확인 필요 표시', async () => {
    vi.stubEnv('KARMOLAB_BOT_RESET_AI_PROVIDERS', 'claude');
    const result = await analyzeResetPost(post, async () => JSON.stringify({ ...verdict, status: 'uncertain' }));
    expect(result).toMatchObject({ status: 'uncertain', analysis: { needsReview: true } });
  });
});
