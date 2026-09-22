/**
 * 검사가 도구 하나를 열 때 쓰는 주소 (change.tool-page-navigation, 2026-09-22).
 *
 * 제 주소 (`/t/<id>/`) 가 있는 도구 146개는 그 장. 제 주소 없는 탭 8개 (configconv 등) 는 묶음 장 + `#탭`.
 * 나머지 (제 주소 없는 도구 63개, 시스템 화면) 만 앱 뿌리의 해시.
 *
 * 왜: 해시 `#id` 로 이어 가면 셸이 제 주소로 **실제 이동**, evaluate 의 문서 소실. 전수 검사
 * 셋 (a11y, wcag, widgets-alive) 이 그 길로 도구 241개를 돌다 못 잼과 12분 걸림 (2026-09-22 실측)
 * 사람이 밟는 자리도 그 장. 해시 화면은 앱 셸의 CSS 를 다 갖고 있어 도구 장에서만 보이는
 * 위반 (로또 장의 빠진 `lotto.css`) 은 못 잼
 *
 * 목록의 출처: `gen-tool-pages` 와 같음 (`tools-seo.json` 에서 은퇴 제외). 묶음: 구운
 * `js/widgets-index.js`. 빌드가 게이트보다 앞이라 늘 있음
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withoutRetired } from './retired-operations.mjs';

const appRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export const TOOL_PAGES = new Set(
  withoutRetired(Object.keys(JSON.parse(fs.readFileSync(path.join(appRoot, 'data/tools-seo.json'), 'utf8')).tools)),
);

export const BUNDLE_OF = (() => {
  try {
    const src = fs.readFileSync(path.join(appRoot, 'js/widgets-index.js'), 'utf8');
    const list = JSON.parse(src.slice(src.indexOf('=[') + 1, src.indexOf('];') + 1));
    return Object.fromEntries(list.filter((m) => m && m.bundle).map((m) => [m.id, m.bundle]));
  } catch {
    return {};
  }
})();

/**
 * @param {string} id 도구 id
 * @param {{ appBase?: string, pagesBase?: string }} [o] 앱 뿌리 (`/apps/karmolab`) 와 구운 장의 뿌리 (`/apps/blog/t`).
 *   저장소를 그대로 내는 검사 서버 기준. `serveRepo` 처럼 배포 모양으로 돌리는 자리는 `/` 와 `/t`
 */
export function toolScreenUrl(id, { appBase = '/apps/karmolab', pagesBase = '/apps/blog/t' } = {}) {
  if (TOOL_PAGES.has(id)) return `${pagesBase}/${id}/`;
  const bundle = BUNDLE_OF[id];
  if (bundle && TOOL_PAGES.has(bundle)) return `${pagesBase}/${bundle}/#${id}`;
  return `${appBase}/#${id}`;
}
