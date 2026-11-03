#!/usr/bin/env node
/**
 * assets/icons.js 를 다시 만든다. face.html 이 쓰는 아이콘 이름 (data-icon, 원형 목록의 icon) 을 모아
 * lucide-static 같은 판에서 받아 경로만 인라인. 새 아이콘은 face.html 에 이름을 쓰고 이걸 돌림.
 *
 *   node scripts/make-icons.mjs          받아서 다시 씀
 *   node scripts/make-icons.mjs --check  다시 쓰지 않고 지금 파일과 같은지만 (다르면 종료 코드 1)
 *
 * 아이콘 Lucide (ISC, https://lucide.dev). 판을 바꾸면 모양이 바뀔 수 있어 고정
 */
import { readFileSync, writeFileSync } from 'node:fs';

const VERSION = '0.469.0';
const root = new URL('../', import.meta.url);
const face = readFileSync(new URL('assets/face.html', root), 'utf8');
const names = [...new Set([
  ...[...face.matchAll(/data-icon="([a-z0-9-]+)"/g)].map((m) => m[1]),
  ...[...face.matchAll(/\bicon: '([a-z0-9-]+)'/g)].map((m) => m[1]),
])].sort();

const lines = [];
for (const name of names) {
  const res = await fetch(`https://unpkg.com/lucide-static@${VERSION}/icons/${name}.svg`);
  if (!res.ok) throw new Error(`${name} 을 못 받음 (${res.status}). Lucide 에 그 이름이 있는지 확인`);
  const svg = await res.text();
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).replace(/\s+/g, ' ').trim();
  lines.push(`  '${name}': '${inner}',`);
}

const out = `/* 메뉴 아이콘. Lucide v${VERSION} (ISC, https://lucide.dev) 에서 받은 그대로. 새 아이콘은 face.html 에 이름을 쓰고 scripts/make-icons.mjs */
const PATHS = {
${lines.join('\n')}
};

/** 이름으로 24x24 선 아이콘 SVG 문자열. 없는 이름은 빈 문자열 */
export function icon(name) {
  const inner = PATHS[name];
  if (inner === undefined) return '';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
}
`;

const target = new URL('assets/icons.js', root);
if (process.argv.includes('--check')) {
  const same = readFileSync(target, 'utf8') === out;
  console.log(same ? `같음 (${names.length}개)` : '다름. node scripts/make-icons.mjs 로 다시 만듦');
  process.exit(same ? 0 : 1);
}
writeFileSync(target, out);
console.log(`icons.js ${names.length}개`);
