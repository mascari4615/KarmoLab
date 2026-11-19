/**
 * 도감 산출물 전수 검사: 외부 이름 목록 대조
 * pre-push 는 새로 담긴 줄만 보므로 이미 나간 문서는 못 잡음. 이 검사는 파일 전체
 * 목록은 memo(private) 에만 있음. 없으면 못 돌림으로 보고하고 종료 0
 * 사용: node scripts/audit-worldbook-names.mjs (npm run audit:worldbook-names)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const karmolabRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(karmolabRoot, '../..');
const memoPath = process.env.KARMODDRINE_MEMO_PATH || path.resolve(repoRoot, '../memo');
const namesPath = path.join(memoPath, 'dotfiles/git-hooks/private-names.txt');
const worldbookPath = path.join(karmolabRoot, 'data/worldbook.json');

if (fs.existsSync(namesPath) === false) {
  console.log(`[audit-worldbook-names] 못 돌림. 외부 이름 목록 없음: ${namesPath}`);
  process.exit(0);
}

const names = fs.readFileSync(namesPath, 'utf8')
  .split('\n')
  .map((line) => line.trim().toLowerCase())
  .filter((line) => line !== '' && line.startsWith('#') === false);

const worldbook = JSON.parse(fs.readFileSync(worldbookPath, 'utf8'));
const docs = Array.isArray(worldbook.docs) ? worldbook.docs : [];
const leaks = [];
for (const doc of docs) {
  const text = JSON.stringify(doc).toLowerCase();
  const found = names.filter((name) => text.includes(name));
  if (found.length > 0) leaks.push(`${doc.source || doc.id}: ${found.join(', ')}`);
}

if (leaks.length > 0) {
  console.log(`[audit-worldbook-names] 외부 이름이 든 문서 ${leaks.length}건`);
  for (const leak of leaks) console.log(`  - ${leak}`);
  console.log('  조치: memo 문서에서 이름 삭제 또는 web: private, 이후 build:worldbook 재실행');
  process.exit(1);
}
console.log(`[audit-worldbook-names] OK. 문서 ${docs.length}건, 외부 이름 ${names.length}개 대조`);
