import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resetRatingStore, writeStoredRatings } from './rating-store';

it('초기화 뒤 옛 예약 저장 없음, 다음 기록은 새 파일에 저장', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rating-store-reset-'));
  const previous = process.env.ARCADE_RATING_FILE;
  const file = path.join(dir, 'ratings.json');
  process.env.ARCADE_RATING_FILE = file;
  vi.useFakeTimers();
  try {
    resetRatingStore();
    writeStoredRatings('gomoku', new Map([['old', { rating: 1600 }]]));
    resetRatingStore();
    vi.advanceTimersByTime(2000);
    expect(fs.existsSync(file)).toBe(false);
    writeStoredRatings('gomoku', new Map([['new', { rating: 1500 }]]));
    vi.advanceTimersByTime(2000);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ gomoku: { new: { rating: 1500 } } });
  } finally {
    resetRatingStore();
    vi.useRealTimers();
    if (previous === undefined) delete process.env.ARCADE_RATING_FILE;
    else process.env.ARCADE_RATING_FILE = previous;
    if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Temporary directory boundary');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
