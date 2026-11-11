# site-router

`lab.mascari4615.com`, `dash.mascari4615.com` 을 GitHub Pages 원본 (`blog.mascari4615.com`) 에 붙이는 Cloudflare Worker. 주소 셋 나누기의 1단계 (memo `changes/site-split.md`).

- 규칙은 `src/route.mjs` 하나. 뿌리 (`/`) 만 호스트마다 다르고 나머지 경로는 그대로
- dash 뿌리는 셸이 고른다 (`toolbox.ts` `hostDefaultPage`, 호스트가 dash 면 대시보드). 서로 가는 링크는 `src/lib/site-hosts.ts`
- 배포는 `.github/workflows/deploy-site-router.yml` (Secret `CLOUDFLARE_API_TOKEN`). `custom_domain = true` 라 wrangler 가 DNS 까지 만든다 (mydash-relay 와 같은 손)
- 보안 헤더 `src/headers.mjs`: 모든 호스트 http 는 https 로 301 과 HSTS, dash 는 frame 차단과 Permissions-Policy, lab 은 바깥 스크립트 출처 CSP. 본문 CSP 는 각 장 meta 가 정본 (memo `systems/security.md` 보안 헤더 절)
- 시험 `npm test`. 되돌리기: Worker 사용자 도메인 둘 삭제
