/**
 * env 층 로더 회귀 (2026-09-25 이름 이전).
 *  ① 새 접두 KARMOLAB_BOT_ 키가 층에서 그대로 읽힘 (일괄 치환이 옛 접두를 새 접두로 바꿔 전부 버린 사고)
 *  ② 옛 접두 키는 새 접두로 읽힘, 같은 층에 새 키가 있으면 새 키 우선
 *  ③ 뒤 층이 앞 층을 덮음
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(__filename);
const { applyBotDotenvLayers } = require('../scripts/load-dotenv-layers.cjs') as {
  applyBotDotenvLayers: (root: string) => void;
};

const OLD = 'YAWN' + 'BOT_';
let root: string;
let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('KARMOLAB_BOT_') || k.startsWith(OLD)) delete process.env[k];
  }
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'envlayers-'));
  fs.mkdirSync(path.join(root, 'config'));
});

afterEach(() => {
  process.env = saved;
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, body: string): void {
  fs.writeFileSync(path.join(root, rel), body, 'utf-8');
}

describe('applyBotDotenvLayers', () => {
  it('새 접두 키를 그대로 읽는다', () => {
    write('config/karmolab-bot-defaults.txt', 'KARMOLAB_BOT_ENV=prod\nKARMOLAB_BOT_X=defaults\n');
    write('config/karmolab-bot.prod.txt', 'KARMOLAB_BOT_CODEX_RESET_BROWSER=chromium\n');
    applyBotDotenvLayers(root);
    expect(process.env.KARMOLAB_BOT_X).toBe('defaults');
    expect(process.env.KARMOLAB_BOT_CODEX_RESET_BROWSER).toBe('chromium');
  });

  it('옛 접두 키는 새 접두로 읽고, 같은 층의 새 키가 이긴다', () => {
    write('config/karmolab-bot-defaults.txt', 'KARMOLAB_BOT_Y=defaults\n');
    write('.env', `${OLD}Y=old-env\n${OLD}Z=old\nKARMOLAB_BOT_Z=new\n`);
    applyBotDotenvLayers(root);
    expect(process.env.KARMOLAB_BOT_Y).toBe('old-env');
    expect(process.env.KARMOLAB_BOT_Z).toBe('new');
  });
});
