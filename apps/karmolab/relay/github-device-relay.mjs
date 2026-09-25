/**
 * 기기 흐름 릴레이 (Cloudflare Worker). 개인 대시보드(mydash) 전용.
 *
 * 왜 있나: `github.com/login/device/code` 와 `github.com/login/oauth/access_token` 은
 * **CORS 를 안 엶**. 브라우저가 직접 부르면 preflight 에서 막힘. 그래서 이 둘만
 * 지나보냄. (`api.github.com` 은 CORS 를 엶. 토큰을 받은 뒤 저장소를 읽는 길에는
 * 이 릴레이가 끼지 않음. 데이터는 브라우저와 GitHub 사이에서만 오감.)
 *
 * 이 워커가 하는 일: 요청 하나를 GitHub 으로 넘기고, 답에 CORS 머리를 붙여 돌려주기.
 * 저장 없음. 로그 없음. 데이터 창구 아님.
 *
 * 환경변수 (Cloudflare 대시보드 또는 `wrangler secret put`):
 *   GITHUB_CLIENT_ID       필수. GitHub **App** 의 Client ID (`Iv1....` / `Iv23...`).
 *                          비밀은 아니지만 여기 두면 사이트를 안 고치고 교체 가능.
 *   GITHUB_CLIENT_SECRET   선택. **GitHub App 기기 흐름에는 필요 없다.**
 *                          OAuth App 으로 할 때만 필요. 그때는 반드시 secret 으로.
 *   ALLOWED_ORIGIN         필수. 예: https://lab.mascari4615.com
 *                          쉼표로 여럿. 여기 없는 출처에는 CORS 안 줌.
 *   GOOGLE_CLIENT_ID       Google 캘린더 연결용 OAuth 웹 클라이언트 id (공개값)
 *   GOOGLE_CLIENT_SECRET   그 클라이언트의 비밀값. **반드시 secret** (배포 워크플로가 저장소 Secret 에서 넣음)
 *
 * Google 두 경로 (2026-09-23, 사용자 "기간 좀 늘릴 수 없나 무한이라던지"):
 *   /google/token    브라우저가 GIS 코드 흐름으로 받은 code 를 갱신 토큰까지 교환
 *   /google/refresh  브라우저에 저장된 갱신 토큰으로 새 1시간 토큰
 *   비밀값이 있어야 되는 교환이라 여기. 토큰은 저장 없이 브라우저로 (GitHub 흐름과 같은 원칙)
 *
 * 배포:
 *   npx wrangler deploy apps/karmolab/relay/github-device-relay.mjs --name mydash-relay
 *   npx wrangler secret put GITHUB_CLIENT_ID --name mydash-relay
 *   (ALLOWED_ORIGIN 은 일반 변수로 둬도 됨)
 */

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GRANT_DEVICE = 'urn:ietf:params:oauth:grant-type:device_code';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/* 속도 제한. IP 당 분당 60회, isolate 메모리 Map. 정확한 전역 제한이 목적이 아니라
   폭주 완화가 목적이라 이 정도로 충분함. isolate 재시작되면 카운트도 같이 비워짐.
   60 인 이유: 로그인 한 번이 device/code 1회 + 5초 폴링 12회 = 약 13회. 20 이면 같은
   NAT 뒤 기기 둘만 돼도 넘음. 실사용의 4배를 남겨 둠. */
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitHits = new Map();

/* 창 지난 IP 항목 제거. 안 지우면 Map 이 단조 증가해 isolate 가 살아 있는 동안 메모리를 먹음. */
function sweepRateLimit(windowStart) {
  for (const [key, times] of rateLimitHits) {
    if (!times.length || times[times.length - 1] <= windowStart) rateLimitHits.delete(key);
  }
}

function checkRateLimit(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  sweepRateLimit(windowStart);
  const hits = (rateLimitHits.get(ip) || []).filter((t) => t > windowStart);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLimitHits.set(ip, hits);
    const retryAfterMs = hits[0] + RATE_LIMIT_WINDOW_MS - now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return { ok: true };
}

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get('origin') || '';
  const ok = allowed.indexOf(origin) >= 0;
  return {
    'access-control-allow-origin': ok ? origin : 'null',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, accept',
    /* 429 를 받은 브라우저가 retry-after 를 읽어야 백오프를 계산함. 노출 안 하면 못 봄. */
    'access-control-expose-headers': 'retry-after',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** GitHub 으로 넘김. 답은 그대로 돌려줌. 우리가 해석하면 GitHub 이 바뀔 때 여기가 거짓말. */
async function toGithub(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: 502, body: { error: 'bad_upstream' } };
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (cors['access-control-allow-origin'] === 'null') {
      const origin = request.headers.get('origin') || '(없음)';
      return json({ error: 'origin_not_allowed', origin }, 403, cors);
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    const rateLimit = checkRateLimit(request);
    if (!rateLimit.ok) {
      return json(
        { error: 'rate_limited' },
        429,
        { ...cors, 'retry-after': String(rateLimit.retryAfterSec) },
      );
    }

    let payload = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const path = new URL(request.url).pathname.replace(/\/+$/, '');

    /* Google. code 교환의 redirect_uri 는 GIS 팝업 흐름의 규약값 'postmessage' */
    if (path.endsWith('/google/token') || path.endsWith('/google/refresh')) {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({ error: 'relay_misconfigured' }, 500, cors);
      const params = { client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET };
      if (path.endsWith('/google/token')) {
        if (!payload.code) return json({ error: 'missing_code' }, 400, cors);
        Object.assign(params, { code: payload.code, grant_type: 'authorization_code', redirect_uri: 'postmessage' });
      } else {
        if (!payload.refresh_token) return json({ error: 'missing_refresh_token' }, 400, cors);
        Object.assign(params, { refresh_token: payload.refresh_token, grant_type: 'refresh_token' });
      }
      const out = await toGithub(GOOGLE_TOKEN_URL, params);
      return json(out.body, out.status, cors);
    }

    const clientId = env.GITHUB_CLIENT_ID;
    if (!clientId) return json({ error: 'relay_misconfigured' }, 500, cors);

    if (path.endsWith('/device/code')) {
      /* scope 를 여기서 안 준다. **GitHub App 은 권한이 App 설정에 있다** (Contents: Read).
         OAuth App 으로 쓸 때만 scope=repo 가 필요하고, 그건 App 을 쓰라는 신호로 본다. */
      const out = await toGithub(DEVICE_CODE_URL, { client_id: clientId });
      return json(out.body, out.status, cors);
    }

    if (path.endsWith('/device/token')) {
      const deviceCode = payload.device_code;
      if (!deviceCode) return json({ error: 'missing_device_code' }, 400, cors);
      const params = { client_id: clientId, device_code: deviceCode, grant_type: GRANT_DEVICE };
      if (env.GITHUB_CLIENT_SECRET) params.client_secret = env.GITHUB_CLIENT_SECRET;
      const out = await toGithub(TOKEN_URL, params);
      return json(out.body, out.status, cors);
    }

    /* 만료 끈 App 에서는 호출 안 됨. 경로만 남겨 둠. */
    if (path.endsWith('/device/refresh')) {
      const refreshToken = payload.refresh_token;
      if (!refreshToken) return json({ error: 'missing_refresh_token' }, 400, cors);
      const params = { client_id: clientId, refresh_token: refreshToken, grant_type: 'refresh_token' };
      if (env.GITHUB_CLIENT_SECRET) params.client_secret = env.GITHUB_CLIENT_SECRET;
      const out = await toGithub(TOKEN_URL, params);
      return json(out.body, out.status, cors);
    }

    return json({ error: 'not_found' }, 404, cors);
  },
};
