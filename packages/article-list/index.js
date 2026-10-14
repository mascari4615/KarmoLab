/* 한 줄 글 목록. 호스트는 자료와 행동만 제공, 행 구조와 갱신은 이 모듈 소유 */
const setText = (el, value) => { if (el.textContent !== String(value ?? '')) el.textContent = String(value ?? ''); };
const node = (doc, tag, cls) => { const el = doc.createElement(tag); el.className = cls; return el; };
const activePreviews = new WeakMap();
let previewId = 0;
const safeLink = (value, base) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  try { const url = new URL(value, base); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
};

export function createArticleRow(post, { document: doc = globalThis.document, actions = [], body, tag = 'section', onPreview } = {}) {
  const box = node(doc, tag, 'refs-post article-row closed');
  const head = node(doc, 'div', 'refs-head article-head');
  const chev = node(doc, 'span', 'refs-chev');
  chev.setAttribute('aria-hidden', 'true');
  const id = node(doc, 'span', 'dim refs-post-id');
  const wrap = node(doc, 'div', 'refs-title-wrap');
  const title = node(doc, 'a', 'refs-title');
  title.target = '_blank'; title.rel = 'noopener noreferrer';
  title.addEventListener('click', (event) => event.stopPropagation());
  const tags = node(doc, 'span', 'refs-tags');
  const previewButton = node(doc, 'button', 'refs-preview-button');
  previewButton.type = 'button'; previewButton.title = '썸네일 보기'; previewButton.setAttribute('aria-label', '글 썸네일 보기');
  previewButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg>';
  previewButton.hidden = !onPreview;
  wrap.append(title, previewButton, tags);
  const author = node(doc, 'a', 'dim refs-post-by writer');
  author.target = '_blank'; author.rel = 'noopener noreferrer';
  author.addEventListener('click', (event) => event.stopPropagation());
  const channel = node(doc, 'span', 'dim article-channel');
  const date = node(doc, 'time', 'dim refs-post-date');
  const count = node(doc, 'span', 'dim refs-count');
  const acts = node(doc, 'div', 'refs-row-actions');
  acts.append(...actions);
  head.append(chev, id, wrap, author, channel, date, count, acts);
  box.append(head);
  if (body) box.append(body);
  const preview = node(doc, 'div', 'article-preview');
  preview.hidden = true;
  preview.id = `article-preview-${++previewId}`;
  preview.setAttribute('role', 'tooltip');
  previewButton.setAttribute('aria-controls', preview.id);
  previewButton.setAttribute('aria-expanded', 'false');
  const image = node(doc, 'img', 'article-preview-image');
  image.alt = ''; image.referrerPolicy = 'no-referrer';
  const message = node(doc, 'span', 'article-preview-message');
  preview.append(image, message);
  box.append(preview);
  let request = 0;
  let previewTimer = null;
  let hideTimer = null;
  let pinned = false;
  const outside = (event) => { if (!box.contains(event.target)) hide(); };
  const escape = (event) => { if (event.key === 'Escape') hide(); };
  const show = async () => {
    clearTimeout(hideTimer);
    if (!onPreview || box.dataset.previewOpen === '1') return;
    activePreviews.get(doc)?.();
    activePreviews.set(doc, hide);
    box.dataset.previewOpen = '1';
    previewButton.setAttribute('aria-expanded', 'true');
    doc.addEventListener('pointerdown', outside);
    doc.addEventListener('keydown', escape);
    const seq = ++request;
    preview.hidden = false; image.hidden = true;
    setText(message, '썸네일 확인 중');
    const rect = title.getBoundingClientRect();
    preview.style.left = `${Math.max(8, Math.min(rect.left, (doc.defaultView?.innerWidth || 320) - 288))}px`;
    preview.style.top = `${Math.max(8, Math.min(rect.bottom + 6, (doc.defaultView?.innerHeight || 600) - 230))}px`;
    try {
      const result = await onPreview(box.articlePost);
      if (request !== seq) return;
      const src = safeLink(result?.image, doc.baseURI);
      if (src) {
        image.onerror = () => { image.hidden = true; setText(message, '썸네일을 표시할 수 없습니다'); };
        image.onload = () => setText(message, '');
        image.src = src; image.hidden = false;
        setText(message, result?.description || '');
      } else setText(message, result?.error || '공개 썸네일 없음');
    } catch (error) { if (request === seq) setText(message, `썸네일 읽기 실패: ${error.message}`); }
  };
  const hide = () => {
    clearTimeout(previewTimer); clearTimeout(hideTimer); request++; pinned = false;
    box.dataset.previewOpen = ''; preview.hidden = true; previewButton.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', outside); doc.removeEventListener('keydown', escape);
    if (activePreviews.get(doc) === hide) activePreviews.delete(doc);
  };
  const leave = () => { if (!pinned) { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 150); } };
  title.addEventListener('pointerenter', () => { clearTimeout(previewTimer); previewTimer = setTimeout(show, 160); });
  title.addEventListener('pointerleave', () => { clearTimeout(previewTimer); leave(); });
  title.addEventListener('focus', show);
  title.addEventListener('blur', leave);
  title.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });
  preview.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  preview.addEventListener('pointerleave', leave);
  previewButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (pinned && !preview.hidden) hide();
    else { pinned = true; clearTimeout(hideTimer); void show(); }
  });
  box.disposeArticlePreview = hide;
  updateArticleRow(box, post);
  return box;
}

export function updateArticleRow(box, post) {
  box.articlePost = post;
  box.dataset.href = post.url || '';
  const head = box.querySelector('.refs-head');
  head.dataset.act = 'refsToggle'; head.dataset.id = String(post.id);
  setText(box.querySelector('.refs-post-id'), post.id);
  const title = box.querySelector('.refs-title');
  setText(title, post.title || String(post.id));
  title.title = post.title || '';
  const titleUrl = safeLink(post.url, box.ownerDocument.baseURI);
  if (titleUrl) title.href = titleUrl; else title.removeAttribute('href');
  const author = box.querySelector('.refs-post-by');
  setText(author, post.author || '-'); author.title = post.authorKey || post.author || '';
  const link = safeLink(post.authorUrl, box.ownerDocument.baseURI);
  if (link && post.authorUrl) author.href = link; else author.removeAttribute('href');
  const channel = box.querySelector('.article-channel');
  setText(channel, post.channel || ''); channel.title = post.channel || ''; channel.hidden = !post.channel;
  const date = box.querySelector('.refs-post-date');
  setText(date, (post.dateText ?? (post.date || '').slice(0, 10)) || '-');
  if (post.date && Number.isFinite(Date.parse(post.date))) date.dateTime = post.date; else date.removeAttribute('datetime');
}

export function articleHeading({ document: doc = globalThis.document, channel = false } = {}) {
  const el = node(doc, 'div', 'refs-board-heading'); el.setAttribute('aria-hidden', 'true');
  for (const [cls, text] of [['refs-post-id', '번호'], ['refs-title-wrap', '제목'], ['refs-post-by', '글쓴이'], ...(channel ? [['article-channel', '채널']] : []), ['refs-post-date', '날짜'], ['refs-count', '자료'], ['refs-row-actions', '행동']]) {
    const part = node(doc, 'span', cls); part.textContent = text; el.append(part);
  }
  return el;
}

export function reconcileArticles(list, posts, create, update = updateArticleRow, keyOf = (post) => post.url || post.id) {
  const old = new Map([...list.children].map((el) => [el.dataset.key, el]));
  let prev = null;
  for (const post of posts) {
    const key = String(keyOf(post));
    let el = old.get(key);
    if (el) { old.delete(key); update?.(el, post); }
    else { el = create(post); el.dataset.key = key; }
    const next = prev ? prev.nextSibling : list.firstChild;
    if (next !== el) list.insertBefore(el, next);
    prev = el;
  }
  for (const el of old.values()) { el.disposeArticlePreview?.(); el.remove(); }
}
