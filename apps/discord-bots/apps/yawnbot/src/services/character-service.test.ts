/**
 * CharacterService default 교체 회귀.
 *  ① setDefaultSlug 의 default 스킨 교체와 채널 매핑 보존
 *  ② 카드 없는 슬러그의 throw 와 .active.json 불변
 *  ③ .active.json 없을 때 fallback 기본값 kkamagi
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CharacterService } from './character-service';

let root: string;

function writeCard(slug: string): void {
  const dir = path.join(root, 'characters', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'card.md'), `---\nslug: ${slug}\nname: ${slug}\n---\n\n# ${slug}\n\n본문\n`, 'utf-8');
}

function readActive(): { default: unknown; channels: Record<string, unknown> } {
  return JSON.parse(fs.readFileSync(path.join(root, 'characters', '.active.json'), 'utf-8'));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'charsvc-'));
  writeCard('yawn');
  writeCard('kkamagi');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('CharacterService default', () => {
  it('setDefaultSlug 는 default 만 바꾸고 채널 매핑을 보존한다', () => {
    const cs = new CharacterService(root, 'yawn');
    cs.initialize();
    cs.setChannelSlug('dm:1', 'yawn');
    cs.setDefaultSlug('kkamagi');
    expect(cs.getDefaultSlug()).toBe('kkamagi');
    expect(cs.resolveSlug('dm:1')).toBe('yawn');
    expect(cs.resolveSlug('dm:2')).toBe('kkamagi');
    expect(readActive().default).toBe('kkamagi');
  });

  it('카드 없는 슬러그는 throw 하고 파일을 바꾸지 않는다', () => {
    const cs = new CharacterService(root, 'yawn');
    cs.initialize();
    const before = fs.readFileSync(path.join(root, 'characters', '.active.json'), 'utf-8');
    expect(() => cs.setDefaultSlug('nobody')).toThrow(/캐릭터를 찾을 수 없음/);
    expect(fs.readFileSync(path.join(root, 'characters', '.active.json'), 'utf-8')).toBe(before);
  });

  it('fallback 기본값은 kkamagi', () => {
    const cs = new CharacterService(root);
    cs.initialize();
    expect(cs.getDefaultSlug()).toBe('kkamagi');
  });
});
