/**
 * lib/markdown/rich-view 글 엔진 시험 (change.karmo-ai-wiki-docs). jsdom 에서 돈다. 브라우저와 앱 전역 없이.
 *
 * 지키는 것
 *   1 앱 전역 (Toolbox, Mdd, marked) 이 없어도 host 만 주면 돈다. 스튜디오 위키가 이 엔진을 앱 밖에서 쓰는 길
 *   2 옵션을 안 주면 지금까지의 KarmoLab 동작 그대로 (제목 id, # 닻, 옛 demoted 규칙, 실행판은 self 만)
 *   3 호스트 옵션: headingOffset, idPrefix, anchors, skipTitle, tableWrap, hooks, onRendered, relativeLinks
 *
 * 사용: npm run test:rich-view
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadMarked() {
    const code = fs.readFileSync(path.join(ROOT, 'js', 'vendor', 'marked.min.js'), 'utf8');
    const exports = {};
    new Function('exports', 'module', code)(exports, { exports });
    return exports;
}

// jsdom 전역 설치. 앱 전역 (Toolbox, Mdd, marked) 은 일부러 안 만듦
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
const w = dom.window;
for (const k of ['window', 'document', 'HTMLElement', 'HTMLAnchorElement', 'HTMLImageElement', 'Node', 'NodeFilter', 'Element', 'getComputedStyle', 'location']) {
    Object.defineProperty(globalThis, k, { value: k === 'window' ? w : k === 'getComputedStyle' ? w.getComputedStyle.bind(w) : w[k], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
globalThis.CSS = w.CSS && w.CSS.escape ? w.CSS : { escape: (s) => String(s).replace(/[^\w¡-￿-]/g, (c) => '\\' + c) };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
w.CSS = globalThis.CSS;

const bundled = esbuild.buildSync({
    entryPoints: [path.join(ROOT, 'src', 'lib', 'markdown', 'rich-view.ts')],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: ['es2020'], logLevel: 'silent',
});
const { renderRichMarkdown, headingSlug } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const marked = loadMarked();
const labels = { toc: '목차', tocTitle: '목차', copy: '복사', copied: '복사함', noMarked: 'marked 없음', diagramFailed: '도해 실패', demo: { run: '실행', reset: '처음으로', code: '코드', result: '결과' } };
const styles = [];
const host = { marked, injectCSS: (id) => styles.push(id), ensureScript: async () => {} };

let failed = 0;
function check(name, ok, got) {
    if (ok) return;
    failed += 1;
    console.error(`✘ ${name}\n  받은 것: ${String(got).slice(0, 300)}`);
}

async function render(md, options = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stop = await renderRichMarkdown(container, md, { trust: 'self', labels, host, tocMin: 0, ...options });
    return { container, stop };
}
const tags = (el, sel) => [...el.querySelectorAll(sel)].map((n) => n.tagName.toLowerCase());

// ── 1 앱 전역 없이 host 만으로
{
    check('앞제: 앱 전역이 없다', typeof globalThis.Toolbox === 'undefined' && typeof globalThis.Mdd === 'undefined' && typeof globalThis.marked === 'undefined', 'Toolbox/Mdd/marked 중 하나가 이미 있음');
    const { container } = await render('# 제목\n\n본문\n');
    check('전역 없이 그려진다', !!container.querySelector('h1') && container.textContent.includes('본문'), container.innerHTML);
    check('CSS 는 host.injectCSS 로', styles.includes('doc-rich'), styles);
    const none = document.createElement('div');
    await renderRichMarkdown(none, '# x', { trust: 'self', labels, tocMin: 0, host: { injectCSS: () => {} } });
    check('marked 가 어디에도 없으면 안내 글자', none.textContent === 'marked 없음', none.innerHTML);
}

// ── 2 기본 동작 보존
{
    const { container } = await render('# 큰 제목\n\n## 절 하나\n\n### 소절\n\n#### 넷째\n');
    check('기본: 제목 단계 그대로', tags(container, 'h1,h2,h3,h4').join() === 'h1,h2,h3,h4', container.innerHTML);
    check('기본: 제목 id 는 슬러그', container.querySelector('h2').id === '절-하나' && container.querySelector('h1').id === '큰-제목', tags(container, '[id]') + container.innerHTML);
    check('기본: # 닻이 붙는다', container.querySelectorAll('.docs-anchor').length === 3, container.innerHTML);
    check('기본: id 슬러그는 export 한 headingSlug 와 같다', headingSlug('절 하나 (부록)') === '절-하나-부록', headingSlug('절 하나 (부록)'));
}
{
    const { container } = await render('# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n', { headings: 'demoted' });
    check('옛 demoted: h1~h3 만 h3~h5, h4 와 h5 는 그대로', tags(container, 'h1,h2,h3,h4,h5').join() === 'h3,h4,h5,h4,h5', tags(container, 'h1,h2,h3,h4,h5').join());
}

// ── 3 호스트 옵션
{
    const { container } = await render('# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\n###### f\n', { headingOffset: 1 });
    check('headingOffset 1: 한 단계씩', tags(container, 'h1,h2,h3,h4,h5,h6').join() === 'h2,h3,h4,h5,h6,h6', tags(container, 'h1,h2,h3,h4,h5,h6').join());
}
{
    const { container } = await render('# 같은\n\n## 같은\n\n## 같은\n', { idPrefix: 'wk-', headingOffset: 1 });
    const ids = [...container.querySelectorAll('[id]')].map((n) => n.id);
    check('idPrefix 와 중복 번호', ids.join() === 'wk-같은,wk-같은-2,wk-같은-3', ids.join());
}
{
    const { container } = await render('# 제목\n\n## 절\n', { anchors: false });
    check('anchors false: 닻 없음, id 는 있음', container.querySelectorAll('.docs-anchor').length === 0 && !!container.querySelector('#절'), container.innerHTML);
}
{
    const same = await render('# 위키 제목\n\n본문\n\n## 절\n', { skipTitle: '위키   제목', headingOffset: 1 });
    check('skipTitle: 같으면 첫 제목 뺌 (공백 차이 무시)', !same.container.textContent.includes('위키 제목') && !!same.container.querySelector('h3'), same.container.innerHTML);
    const diff = await render('# 다른 제목\n\n본문\n', { skipTitle: '위키 제목' });
    check('skipTitle: 다르면 둠', !!diff.container.querySelector('h1'), diff.container.innerHTML);
    const deeper = await render('## 절\n\n# 뒤에 나온 큰 제목\n', { skipTitle: '절' });
    check('skipTitle: 가장 윗단계 첫 제목만 대상', !!deeper.container.querySelector('h2'), deeper.container.innerHTML);
}
{
    const { container } = await render('| a | b |\n| - | - |\n| 1 | 2 |\n', { tableWrap: 'wiki-table' });
    const box = container.querySelector('div.wiki-table');
    check('tableWrap: 표를 상자로 감쌈', !!box && box.firstElementChild.tagName === 'TABLE' && container.querySelectorAll('table').length === 1, container.innerHTML);
}
{
    const seen = [];
    const hadSrc = [];
    const { container } = await render('[문서](../a.md) [밖](https://example.com) [죽은 링크](x.ts)\n\n![그림](pic.png) ![밖 그림](https://example.com/a.png)', {
        hooks: {
            link: (a) => { seen.push(a.getAttribute('href')); if (a.getAttribute('href').endsWith('.ts')) return false; a.dataset.act = 'open'; },
            image: (img, src) => { hadSrc.push(img.hasAttribute('src')); if (src.startsWith('http')) return false; img.dataset.checked = '1'; return 'resolved/' + src; },
        },
    });
    check('hooks.image: 훅이 불릴 때 src 가 없다 (브라우저가 미리 요청하지 않게)', hadSrc.length === 2 && hadSrc.every((x) => x === false), hadSrc.join());
    check('hooks.image: 문자열을 돌려주면 그 src, data-src 는 남지 않음', container.querySelector('img').getAttribute('src') === 'resolved/pic.png' && !container.querySelector('[data-src]'), container.innerHTML);
    check('hooks.link: 모든 링크를 한 번씩', seen.join() === '../a.md,https://example.com,x.ts', seen.join());
    check('hooks.link: 속성을 붙일 수 있음', container.querySelector('a[href="../a.md"]').dataset.act === 'open', container.innerHTML);
    check('hooks.link: false 면 글자만 남음', !container.querySelector('a[href="x.ts"]') && container.textContent.includes('죽은 링크'), container.innerHTML);
    check('hooks.image: 속성 손봄, false 면 alt 글자', container.querySelectorAll('img').length === 1 && container.querySelector('img').dataset.checked === '1' && container.textContent.includes('밖 그림'), container.innerHTML);
}
{
    // 훅이 아무것도 안 돌려주면 src 는 호스트가 직접 (원격 화면처럼 비동기로 변환). 엔진은 src 를 달지 않음
    const { container } = await render('![비동기](pic.png)', { hooks: { image: (img) => { img.dataset.owner = 'host'; } } });
    const img = container.querySelector('img');
    check('hooks.image: 반환값 없으면 src 없이 호스트 담당', !!img && !img.hasAttribute('src') && img.dataset.owner === 'host', container.innerHTML);
    // 훅 없음: 기존처럼 src 가 바로 있음
    const plain = await render('![그림](pic.png)');
    check('훅 없으면 기존처럼 src', plain.container.querySelector('img')?.getAttribute('src') === 'pic.png', plain.container.innerHTML);
}
{
    const calls = [];
    const md = '```prompt\n1girl, solo\n```\n\n```js\nlet x = 1\n```\n\n```demo-html\n<b>hi</b>\n```\n';
    const self = await render(md, { hooks: { codeBlock: (pre, code, lang) => calls.push(lang) } });
    check('hooks.codeBlock: 언어 표기가 있는 블록마다', calls.join() === 'prompt,js', calls.join());
    check('hooks.codeBlock: 실행판이 된 블록은 안 부름', !calls.includes('demo-html') && !!self.container.querySelector('[data-demo], .doc-demo'), self.container.innerHTML);
}
{
    let info = null;
    await render('# a\n\n## b\n\n### c\n', { onRendered: (i) => { info = i; }, idPrefix: 'p-' });
    check('onRendered: 제목 목록', !!info && info.headings.map((h) => `${h.level}:${h.id}`).join() === '1:p-a,2:p-b,3:p-c', JSON.stringify(info && info.headings));
    check('onRendered: body 를 줌', !!info && info.body instanceof HTMLElement, info);
}

// ── 신뢰와 상대 경로
{
    const md = '[문서](../a.md) ![그림](pic.png)';
    const off = await render(md, { trust: 'user' });
    check('user 기본: 상대 경로는 글자만', !off.container.querySelector('a') && !off.container.querySelector('img'), off.container.innerHTML);
    const on = await render(md, { trust: 'user', relativeLinks: true });
    check('user + relativeLinks: 링크와 그림 살림', !!on.container.querySelector('a[href="../a.md"]') && !!on.container.querySelector('img[src="pic.png"]'), on.container.innerHTML);
    const bad = await render('[x](javascript:alert(1)) <script>alert(1)</script>', { trust: 'user', relativeLinks: true });
    check('user + relativeLinks: 위험한 것은 그대로 막힘', !bad.container.querySelector('a') && !bad.container.querySelector('script'), bad.container.innerHTML);
}
{
    const demo = '```demo-html\n<p>안녕</p>\n```\n';
    const self = await render(demo, { trust: 'self' });
    const frame = self.container.querySelector('iframe.doc-demo-view');
    check('self: 실행판은 격리 iframe (allow-scripts 만)', !!frame && frame.getAttribute('sandbox') === 'allow-scripts', self.container.innerHTML);
    const user = await render(demo, { trust: 'user' });
    check('user: 실행판 없음, 코드 글자로', !user.container.querySelector('iframe') && user.container.textContent.includes('<p>안녕</p>'), user.container.innerHTML);
}

// ── 도해와 목차
{
    const { container } = await render('```mermaid\nflowchart LR\n  A[가] --> B[나]\n```\n');
    check('도해: mermaid 를 svg 로', !!container.querySelector('.mermaid svg'), container.innerHTML);
}
{
    const { container } = await render('# 큰\n\n## 하나\n\n## 둘\n', { tocMin: 2 });
    check('목차: 제목 3개면 오른쪽 목차', container.querySelectorAll('.docs-toc-a').length === 3, container.innerHTML);
    const evil = await render('# 큰\n\n## &lt;img src=x onerror=alert(1)&gt;\n\n## 둘\n', { tocMin: 2 });
    check('목차: 제목 글자는 escape (전역 escape 가 없어도)', !evil.container.querySelector('.docs-toc-listnav img') && evil.container.querySelector('.docs-toc-listnav').innerHTML.includes('&lt;img'), evil.container.innerHTML);
}

if (failed) {
    console.error(`[test-rich-view] ✘ ${failed}개 실패`);
    process.exit(1);
}
console.log('[test-rich-view] 전부 통과. 앱 전역 없이 host 로 돌고, 기본 동작은 그대로, 호스트 옵션과 신뢰 경계 정상');
