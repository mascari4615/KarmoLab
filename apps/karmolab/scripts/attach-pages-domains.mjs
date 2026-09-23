/**
 * 주소 셋을 Cloudflare Pages 프로젝트 셋에 붙인다 (memo change.site-split, 2026-09-23)
 *
 * 왜 손으로 안 하나: 대시보드에서 세 번 누르면 순서를 놓치기 쉽고, 되돌릴 때 무엇을 건드렸는지 안 남음
 * 이 스크립트는 **무엇을 할지 먼저 찍고** (`--dry`, 기본), `--apply` 를 줘야 실제로 붙임
 *
 * 하는 일 둘
 *   ① 같은 이름의 Worker 사용자 도메인이 있으면 알림. 한 이름은 한 곳만
 *   ② Pages 프로젝트에 domain 추가 (`/pages/projects/<이름>/domains`)
 * DNS 레코드는 Cloudflare 가 스스로 맞춘다. 되돌리기는 도메인 삭제 (`DELETE .../domains/<이름>`)
 *
 * 사용: 환경변수 CLOUDFLARE_API_TOKEN 을 주고 `node scripts/attach-pages-domains.mjs [--apply]`
 */
const ACC = 'ce18bd3c1df233b3cd533ef0623cbafe';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const APPLY = process.argv.includes('--apply');

/** 주소와 그 주소를 받을 Pages 프로젝트 */
const PAIRS = [
  { host: 'lab.mascari4615.com', project: 'karmolab-lab' },
  { host: 'blog.mascari4615.com', project: 'karmolab-blog' },
  { host: 'dash.mascari4615.com', project: 'karmolab-dash' },
];

if (!TOKEN) {
  console.error('[attach-pages-domains] CLOUDFLARE_API_TOKEN 이 없다');
  process.exit(2);
}

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.success !== false, status: res.status, body };
};

const workerDomains = await api(`/accounts/${ACC}/workers/domains`);
const taken = new Set((workerDomains.body.result || []).map((d) => d.hostname));

let failed = 0;
for (const { host, project } of PAIRS) {
  const now = await api(`/accounts/${ACC}/pages/projects/${project}/domains`);
  const mine = (now.body.result || []).find((d) => d.name === host);
  const already = !!mine;
  const note = [
    `${host} → ${project}`,
    already ? `이미 붙어 있음 (상태 ${mine.status || '?'}${mine.validation_data ? ' ' + (mine.validation_data.status || '') : ''})` : '붙일 것',
    taken.has(host) ? 'Worker 가 이 이름을 쥠 (먼저 뗀다)' : '',
  ].filter(Boolean).join(' | ');
  console.log(`  ${note}`);
  if (already || !APPLY) continue;
  if (taken.has(host)) { failed++; continue; }
  const add = await api(`/accounts/${ACC}/pages/projects/${project}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: host }),
  });
  if (!add.ok) { failed++; console.error(`    실패 ${add.status} ${JSON.stringify(add.body.errors || []).slice(0, 200)}`); }
  else console.log('    붙였다');
}
if (!APPLY) console.log('[attach-pages-domains] 찍어만 봤다. 실제로 붙이려면 --apply');
process.exit(failed ? 1 : 0);
