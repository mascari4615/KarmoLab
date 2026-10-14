/* 글 Embed 메타데이터만 추출. 원격 HTML 삽입과 iframe 실행 없음 */
globalThis.readArcaEmbed = () => {
  const author = document.querySelector('.article-head .user-info [data-filter]')?.getAttribute('data-filter') || '';
  if (!author) throw new Error('글 작성자를 확인할 수 없습니다. 접근 권한과 페이지 상태를 확인하세요.');
  const raw = document.querySelector('meta[property="og:image"]')?.content || '';
  let image = '';
  try {
    const url = new URL(raw, location.href);
    if (url.protocol === 'https:' && /(^|\.)(arca\.live|namu\.la)$/.test(url.hostname)) image = url.href;
  } catch { /* 공개 그림 메타데이터 없음 */ }
  return { author, image, title: document.querySelector('meta[property="og:title"]')?.content || '',
    description: document.querySelector('meta[property="og:description"]')?.content?.slice(0, 240) || '' };
};
