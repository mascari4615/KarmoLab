#!/usr/bin/env node
// 런처 목록 (launcher-catalog 릴리스의 catalog.json) 에 앱 한 줄을 고쳐 씀. 릴리스 CI 가 판을 낸 직후 부름
// 사용: node catalog-put.mjs <catalog.json> <앱 id> <latest.json> [플랫폼 열쇠]
// latest.json 은 tauri-action 이 올린 것 (version, pub_date, platforms.<열쇠>.url, signature)
import fs from 'node:fs';

const [catalogPath, id, latestPath, platform = 'windows-x86_64-nsis'] = process.argv.slice(2);
if (!catalogPath || !id || !latestPath) {
  console.error('사용: node catalog-put.mjs <catalog.json> <앱 id> <latest.json> [플랫폼]');
  process.exit(2);
}
const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
const p = (latest.platforms && (latest.platforms[platform] || latest.platforms['windows-x86_64'])) || null;
if (!p || !p.url || !p.signature) {
  console.error('latest.json 에 ' + platform + ' 주소나 서명이 없음');
  process.exit(1);
}
let catalog = { schema: 1, apps: {} };
try {
  catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
} catch {
  /* 첫 판. 빈 목록부터 */
}
catalog.apps = catalog.apps || {};
catalog.apps[id] = { version: latest.version, pub_date: latest.pub_date, url: p.url, signature: p.signature };
catalog.updated = new Date().toISOString();
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
console.log('catalog', id, latest.version);
