/** 기기 로그 토큰 분리 (2026-11-22). 빌드에 심기는 보내기 토큰으로 읽기와 삭제 불가 */
import { describe, it, expect } from 'vitest';
import type { Request } from 'express';

import { authorizeIngest, authorizeRead, deviceLogTokens } from './device-log';

const INGEST = 'ingest-token-value';
const READ = 'read-token-value';

function request(options: { header?: string; query?: string } = {}): Request {
  return {
    headers: options.header ? { 'x-karmolab-bot-secret': options.header } : {},
    query: options.query ? { t: options.query } : {},
  } as unknown as Request;
}

describe('device-log 토큰', () => {
  const both = { ingest: INGEST, read: READ };

  it('보내기 토큰은 보내기만 연다', () => {
    expect(authorizeIngest(request({ header: INGEST }), both)).toBe(true);
    expect(authorizeRead(request({ header: INGEST }), both)).toBe(false);
    expect(authorizeRead(request({ query: INGEST }), both)).toBe(false);
  });

  it('읽기 토큰은 읽기만 연다', () => {
    expect(authorizeRead(request({ header: READ }), both)).toBe(true);
    expect(authorizeRead(request({ query: READ }), both)).toBe(true);
    expect(authorizeIngest(request({ header: READ }), both)).toBe(false);
  });

  it('보내기 토큰만 있고 읽기 토큰이 없으면 읽기는 닫힌다', () => {
    const ingestOnly = { ingest: INGEST, read: '' };
    expect(authorizeRead(request(), ingestOnly)).toBe(false);
    expect(authorizeRead(request({ header: INGEST }), ingestOnly)).toBe(false);
  });

  it('둘 다 없으면 dev 모드로 열린다', () => {
    const none = { ingest: '', read: '' };
    expect(authorizeIngest(request(), none)).toBe(true);
    expect(authorizeRead(request(), none)).toBe(true);
  });

  it('LOCAL_WEBHOOK_SECRET 으로 대신 채우지 않는다', () => {
    const tokens = deviceLogTokens({ LOCAL_WEBHOOK_SECRET: 'webhook-secret' } as NodeJS.ProcessEnv);
    expect(tokens).toEqual({ ingest: '', read: '' });
  });
});
