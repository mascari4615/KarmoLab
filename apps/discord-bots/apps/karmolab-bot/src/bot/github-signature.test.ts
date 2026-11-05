import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { githubWebhookSecret, isValidGithubSignature } from './github-signature';

const secret = 'fixture-webhook-secret';
const body = Buffer.from('{"action":"closed"}');
const signed = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('isValidGithubSignature', () => {
  it('올바른 서명을 통과시킨다', () => {
    expect(isValidGithubSignature(body, signed, secret)).toBe(true);
  });

  it('변조, 다른 비밀, 없는 머리, 없는 본문을 거절한다', () => {
    expect(isValidGithubSignature(Buffer.from('{"action":"opened"}'), signed, secret)).toBe(false);
    expect(isValidGithubSignature(body, signed, 'other')).toBe(false);
    expect(isValidGithubSignature(body, undefined, secret)).toBe(false);
    expect(isValidGithubSignature(body, 'sha1=abc', secret)).toBe(false);
    expect(isValidGithubSignature(undefined, signed, secret)).toBe(false);
  });

  it('길이가 다른 서명도 예외 없이 거절한다', () => {
    expect(isValidGithubSignature(body, 'sha256=00', secret)).toBe(false);
  });
});

describe('githubWebhookSecret', () => {
  it('환경 변수를 읽고 없으면 빈 값', () => {
    expect(githubWebhookSecret({ KARMOLAB_BOT_GITHUB_WEBHOOK_SECRET: 'a' })).toBe('a');
    expect(githubWebhookSecret({})).toBe('');
  });
});
