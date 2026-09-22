/**
 * lab.mascari4615.com, dash.mascari4615.com Cloudflare Worker (memo change.site-split, 2026-09-22).
 * 원본은 GitHub Pages 하나 (blog.mascari4615.com). 호스트마다 뿌리만 다르게 낸다. 규칙은 `src/route.mjs`.
 * files.mascari4615.com 이 Pages `/files/` 를 프록시하는 것과 같은 손.
 *
 * 캐시: 원본 응답의 cache-control 을 그대로 넘긴다. 여기서 더 잡아 두지 않는다 (배포 직후 옛 판이 남지 않게).
 * 호스트 헤더: 원본에는 origin 호스트로 간다. 응답의 절대 주소 (og:url, canonical) 는 손대지 않는다 (2단계).
 */
import { originPath } from './src/route.mjs';

const PASS_REQ = ['accept', 'accept-language', 'accept-encoding', 'if-none-match', 'if-modified-since', 'range', 'user-agent'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = String(env.ORIGIN || 'https://blog.mascari4615.com').replace(/\/$/, '');
    const target = origin + originPath(url.host, url.pathname) + url.search;
    const headers = new Headers();
    for (const k of PASS_REQ) { const v = request.headers.get(k); if (v) headers.set(k, v); }
    const res = await fetch(target, { method: request.method, headers, redirect: 'manual' });
    const out = new Headers(res.headers);
    // 원본이 자기 호스트로 보내는 리다이렉트는 이 호스트로 되돌린다 (/x -> /x/ 같은 것)
    const loc = out.get('location');
    if (loc && loc.startsWith(origin)) out.set('location', url.origin + loc.slice(origin.length));
    out.set('x-site-router', url.host.split('.')[0]);
    return new Response(res.body, { status: res.status, headers: out });
  },
};
