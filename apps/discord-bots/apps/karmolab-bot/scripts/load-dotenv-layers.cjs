'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/**
 * 욘봇·카카오 스크립트 공통 4-레이어 env 로더 (TASK-YB-028).
 *
 * 본질(민감도·가변성)대로 통로 분리. 뒤가 앞을 덮어씀:
 *   ① config/karmolab-bot-defaults.txt     — 불변·비밀 아님 (모델명/간격/임계값). override:false
 *   ② config/karmolab-bot.<env>.txt        — 비밀 아닌 env별 (채널/길드/유저 ID 등). 커밋(public). override:true
 *   ③ (.env 에 주입됨) 진짜 비밀만     — 토큰·API키·webhook URL. prod=GitHub secret→workflow가 .env 조립
 *   ④ .env                            — 머신 경로 + 로컬 override + ③ 주입분. override:true (최우선)
 *
 * <env> 판별 = KARMOLAB_BOT_ENV. profile 로드 *전*에 알아야 하므로
 * OS env → .env peek → defaults peek 순으로 먼저 resolve, 기본 'dev'(안전).
 * prod 는 deploy workflow 가 .env 에 `KARMOLAB_BOT_ENV=prod` 리터럴을 박음(비밀 아님).
 *
 * @param {string} botRoot - `apps/discord-bots/apps/karmolab-bot` 절대 경로
 */
function peekKey(absPath, key) {
  if (!fs.existsSync(absPath)) return undefined;
  try {
    const parsed = dotenv.parse(fs.readFileSync(absPath));
    return parsed[key] || undefined;
  } catch {
    return undefined;
  }
}

/** 옛 이름 접두 (2026-09-25 이름 이전). 옛 .env 와 서비스 환경 읽기 호환 */
const LEGACY_PREFIX = 'YAWNBOT_';
const PREFIX = 'KARMOLAB_BOT_';

/** 옛 접두 키의 새 접두 복사. 새 키가 이미 있으면 새 키 우선 */
function mirrorLegacyKeys(env = process.env) {
  for (const key of Object.keys(env)) {
    if (!key.startsWith(LEGACY_PREFIX)) continue;
    const next = PREFIX + key.slice(LEGACY_PREFIX.length);
    if (env[next] === undefined) env[next] = env[key];
  }
}

function resolveEnvName(botRoot) {
  mirrorLegacyKeys();
  if (process.env.KARMOLAB_BOT_ENV) return process.env.KARMOLAB_BOT_ENV.trim();
  const fromDotenv =
    peekKey(path.join(botRoot, '.env'), 'KARMOLAB_BOT_ENV') ||
    peekKey(path.join(botRoot, '.env'), LEGACY_PREFIX + 'ENV');
  if (fromDotenv) return fromDotenv.trim();
  const fromDefaults = peekKey(
    path.join(botRoot, 'config', 'karmolab-bot-defaults.txt'),
    'KARMOLAB_BOT_ENV',
  );
  if (fromDefaults) return fromDefaults.trim();
  return 'dev';
}

function applyBotDotenvLayers(botRoot) {
  const envName = resolveEnvName(botRoot);

  const files = [
    path.join(botRoot, 'config', 'karmolab-bot-defaults.txt'),
    path.join(botRoot, 'config', `karmolab-bot.${envName}.txt`),
    path.join(botRoot, '.env'),
  ];

  // 층마다 옛 접두 키를 새 접두로 변환. 옛 .env 값도 층 순서대로 적용
  let seen = 0;
  for (const abs of files) {
    if (!fs.existsSync(abs)) continue;
    const parsed = dotenv.parse(fs.readFileSync(abs));
    const layer = {};
    for (const [key, value] of Object.entries(parsed)) {
      const name = key.startsWith(LEGACY_PREFIX) ? PREFIX + key.slice(LEGACY_PREFIX.length) : key;
      if (!key.startsWith(LEGACY_PREFIX) || parsed[name] === undefined) layer[name] = value;
    }
    for (const [key, value] of Object.entries(layer)) {
      if (seen > 0 || process.env[key] === undefined) process.env[key] = value;
    }
    seen++;
  }
  mirrorLegacyKeys();
}

module.exports = { applyBotDotenvLayers, resolveEnvName, mirrorLegacyKeys };
