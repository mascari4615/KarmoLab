import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createArticleRow, updateArticleRow, reconcileArticles } from './index.js';
const { JSDOM } = createRequire(new URL('../../apps/karmolab/package.json', import.meta.url))('jsdom');
const post = { id: 1, title: '<script> 제목', url: 'https://arca.live/b/example/1', author: '작성자', date: '2026-10-14T00:00:00Z' };

test('공용 행: 안전한 글자, 기존 행동 슬롯, 키보드 포커스 유지', () => {
  const dom = new JSDOM('<ol id="list"></ol>', { url: 'http://localhost/' });
  const doc = dom.window.document;
  const list = doc.getElementById('list');
  const action = doc.createElement('button'); action.textContent = '갱신';
  const create = (p) => createArticleRow(p, { document: doc, tag: 'li', actions: [action] });
  reconcileArticles(list, [post], create);
  const title = list.querySelector('.refs-title'); title.focus();
  reconcileArticles(list, [{ ...post, title: '새 제목' }], create);
  assert.equal(doc.activeElement, title);
  assert.equal(list.querySelector('.refs-title'), title);
  assert.equal(title.textContent, '새 제목');
  assert.equal(list.querySelector('.refs-row-actions button'), action);
  assert.equal(list.querySelector('script'), null);
  updateArticleRow(list.firstChild, { ...post, url: 'javascript:alert(1)' });
  assert.notEqual(title.getAttribute('href'), 'javascript:alert(1)');
  dom.window.close();
});

test('공용 썸네일: 포커스 시 요청, 사라진 팝업의 늦은 응답 무시', async () => {
  const dom = new JSDOM('<main></main>', { url: 'http://localhost/' });
  let resolve;
  const el = createArticleRow(post, { document: dom.window.document, onPreview: () => new Promise((r) => { resolve = r; }) });
  dom.window.document.querySelector('main').append(el);
  const title = el.querySelector('.refs-title');
  title.focus();
  assert.equal(el.querySelector('.article-preview').hidden, false);
  title.blur();
  await new Promise((r) => setTimeout(r, 170));
  resolve({ image: 'https://ac.arca.live/safe-example.webp' });
  await Promise.resolve();
  assert.equal(el.querySelector('.article-preview').hidden, true);
  assert.equal(el.querySelector('img').hasAttribute('src'), false);
  dom.window.close();
});

test('썸네일: 명시적 버튼으로 고정, 포인터 진입 유지, Escape 닫기', async () => {
  const dom = new JSDOM('<main></main>', { url: 'http://localhost/' });
  const el = createArticleRow(post, { document: dom.window.document, onPreview: async () => ({ image: '', description: '' }) });
  dom.window.document.querySelector('main').append(el);
  const button = el.querySelector('.refs-preview-button');
  button.click();
  await Promise.resolve();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  el.querySelector('.refs-title').dispatchEvent(new dom.window.Event('pointerleave'));
  el.querySelector('.article-preview').dispatchEvent(new dom.window.Event('pointerenter'));
  await new Promise((r) => setTimeout(r, 170));
  assert.equal(el.querySelector('.article-preview').hidden, false);
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(el.querySelector('.article-preview').hidden, true);
  dom.window.close();
});

test('공용 썸네일: 빈 결과와 읽기 실패 표시, 위험 프로토콜 제외', async () => {
  for (const result of [{ image: 'javascript:alert(1)' }, { error: '접근 제한' }]) {
    const dom = new JSDOM('<main></main>', { url: 'http://localhost/' });
    const el = createArticleRow(post, { document: dom.window.document, onPreview: async () => result });
    dom.window.document.querySelector('main').append(el);
    el.querySelector('.refs-title').focus();
    await Promise.resolve();
    assert.equal(el.querySelector('img').hasAttribute('src'), false);
    assert.match(el.querySelector('.article-preview-message').textContent, /썸네일 없음|접근 제한/);
    dom.window.close();
  }
});
