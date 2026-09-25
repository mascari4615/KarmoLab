/**
 * 구글 연동. 토큰 받아 오기 (TASK-KL-321, 갱신 2026-09-23)
 *
 * 두 장을 든다. 한 시간짜리 접근 토큰과, 그것을 다시 받는 갱신 토큰.
 * 갱신 토큰은 브라우저만으로는 못 받는다 (교환에 클라이언트 비밀값이 든다). 그래서
 * GIS **코드** 흐름으로 code 를 받고, 교환과 갱신은 mydash 릴레이 (`relay/github-device-relay.mjs`
 * 의 `/google/token`, `/google/refresh`) 몫. 릴레이는 저장 없이 응답만.
 *
 * 결과: 한 번 연결하면 로그아웃하거나 구글 쪽 허가를 거둘 때까지 유지 (사용자 2026-09-23
 * "기간 좀 늘릴 수 없나 무한이라던지"). 단 Console 의 앱 게시 상태가 테스트면 갱신 토큰이 7일
 */

import { clearEventCache } from './event-cache';

declare const __KARMOLAB_GOOGLE_CLIENT_ID__: string;

/** 빌드할 때 박아 넣는다. 구글 클라이언트 id 는 공개값이라 번들에 있어도 된다. */
export const GOOGLE_CLIENT_ID: string =
    typeof __KARMOLAB_GOOGLE_CLIENT_ID__ === 'string' ? __KARMOLAB_GOOGLE_CLIENT_ID__ : '';

const TOKEN_KEY = 'karmolab_google_token';
const REFRESH_KEY = 'karmolab_google_refresh';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
/** `data/mydash-config.json` 의 relay 와 같은 주소. 이 모듈은 설정을 안 읽는 자리에서도 쓰여 여기 한 줄 */
const RELAY = 'https://mydash-relay.mascari4615.com';

const SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks'
].join(' ');

interface StoredToken {
    access_token: string;
    expires_at: number;
}

interface CodeClient {
    requestCode: () => void;
}

interface GisNamespace {
    accounts: {
        oauth2: {
            initCodeClient: (cfg: {
                client_id: string;
                scope: string;
                ux_mode: 'popup';
                callback: (res: { code?: string; error?: string }) => void;
                error_callback?: (err: { type?: string }) => void;
            }) => CodeClient;
            revoke?: (token: string, done?: () => void) => void;
        };
    };
}

type TokenReply = { access_token?: string; expires_in?: number; refresh_token?: string; error?: string };

function gis(): GisNamespace | undefined {
    return (window as unknown as { google?: GisNamespace }).google;
}

/** 남은 시간이 5분보다 적으면 없는 것으로 친다. 쓰다가 중간에 끊기는 게 더 나쁘다. */
export function storedToken(): string | null {
    try {
        const raw = localStorage.getItem(TOKEN_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw) as StoredToken;
        if (data.expires_at > Date.now() + 300000) return data.access_token;
        localStorage.removeItem(TOKEN_KEY);
    } catch {
        localStorage.removeItem(TOKEN_KEY);
    }
    return null;
}

function storedRefresh(): string | null {
    try {
        return localStorage.getItem(REFRESH_KEY);
    } catch {
        return null;
    }
}

function storeToken(token: string, expiresInSec: number): void {
    try {
        const data: StoredToken = { access_token: token, expires_at: Date.now() + expiresInSec * 1000 };
        localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
    } catch {
        /* 저장을 못 해도 이번 세션에는 쓸 수 있다 */
    }
}

/** 릴레이에 한 번. 실패는 null (그물, 설정, 거절 전부). 부르는 쪽은 다시 연결 로 간다 */
async function relay(path: string, body: Record<string, string>): Promise<TokenReply | null> {
    try {
        const res = await fetch(RELAY + path, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(body),
        });
        const j = (await res.json()) as TokenReply;
        return res.ok ? j : { error: j.error || String(res.status) };
    } catch {
        return null;
    }
}

/** 받은 답을 저장. 갱신 토큰은 처음 교환 때만 온다. 갱신 답에는 없으니 있던 것을 그대로 둔다 */
function keep(reply: TokenReply | null): string | null {
    if (!reply || !reply.access_token) return null;
    storeToken(reply.access_token, reply.expires_in ?? 3600);
    if (reply.refresh_token) {
        try {
            localStorage.setItem(REFRESH_KEY, reply.refresh_token);
        } catch {
            /* 못 적으면 한 시간짜리로만 산다 */
        }
    }
    return reply.access_token;
}

let refreshing: Promise<string | null> | null = null;

/**
 * 창 없이 쓸 수 있는 토큰. 살아 있는 접근 토큰, 없으면 갱신 토큰으로 새로. 둘 다 없으면 null.
 * 갱신이 invalid_grant (허가 철회 또는 7일 테스트 만료) 면 갱신 토큰 삭제
 */
export async function ensureToken(): Promise<string | null> {
    const live = storedToken();
    if (live) return live;
    const rt = storedRefresh();
    if (!rt) return null;
    if (!refreshing) {
        refreshing = (async () => {
            const reply = await relay('/google/refresh', { refresh_token: rt });
            if (reply && reply.error === 'invalid_grant') {
                try {
                    localStorage.removeItem(REFRESH_KEY);
                } catch {
                    /* 무시 */
                }
            }
            return keep(reply);
        })().finally(() => {
            refreshing = null;
        });
    }
    return refreshing;
}

export function forgetToken(): void {
    const token = storedToken();
    const rt = storedRefresh();
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
    } catch {
        /* 무시 */
    }
    /* 저장해 둔 일정과 캘린더 목록도. 남의 화면에 내 일정이 남지 않게 */
    clearEventCache();
    /* 구글 쪽 허가도 같이 철회. 안 하면 이 브라우저에서만 로그아웃.
       갱신 토큰 철회 시 접근 토큰도 같이 무효 */
    const target = rt || token;
    if (target) gis()?.accounts.oauth2.revoke?.(target);
}

let gisLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
    if (gis()) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('gsi load failed')));
            return;
        }
        const script = document.createElement('script');
        script.src = GIS_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('gsi load failed'));
        document.head.appendChild(script);
    });
    return gisLoading;
}

/**
 * 연결. 쓸 수 있는 토큰이 있으면 (갱신 포함) 그걸 그대로 준다. 없으면 연동 창을 띄워 code 를 받고
 * 릴레이에서 두 장으로 교환. 사용자가 창을 닫으면 `null` (오류가 아니라 취소).
 * 코드 흐름의 교환은 늘 오프라인 허가라 갱신 토큰이 온다. 구글은 그것을 첫 동의 때만 주므로,
 * 답에 갱신 토큰이 없으면 한 시간짜리로만 산다 (그때는 myaccount 에서 허가를 거두고 다시 연결)
 */
export async function requestToken(): Promise<string | null> {
    if (!GOOGLE_CLIENT_ID) throw new Error('no-client-id');
    const existing = await ensureToken();
    if (existing) return existing;

    await loadGis();
    const oauth2 = gis()?.accounts.oauth2;
    if (!oauth2) throw new Error('gsi-unavailable');

    const code = await new Promise<string | null>((resolve) => {
        const client = oauth2.initCodeClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            ux_mode: 'popup',
            callback: (res) => resolve(res.error || !res.code ? null : res.code),
            error_callback: () => resolve(null),
        });
        client.requestCode();
    });
    if (!code) return null;
    const reply = await relay('/google/token', { code });
    if (!reply || !reply.access_token) throw new Error('google-token ' + ((reply && reply.error) || 'relay'));
    return keep(reply);
}
