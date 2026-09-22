/**
 * blog.mascari4615.com 전용 바탕 (memo change.site-split, 2026-09-22)
 *
 * KarmoLab 셸 (`index.html`, `toolbox.js`, 옆줄, 머리띠) 을 안 쓴다. 글만 읽는 장이라
 * 머리 줄 한 줄과 본문뿐. 겉모습 정본은 `css/community.css` 그대로 링크 (규칙을 베끼지 않음).
 *
 * 부르는 곳: `gen-post-pages.mjs` (글 장, 글 목록, 404).
 */
import { CSP_CONTENT } from './head-security.mjs';

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SITE = 'https://blog.mascari4615.com';

/* 머리 줄. 이름과 글 목록, 그리고 다른 주소 둘. 그 외 아무것도 없음 */
function header() {
  return (
    '<header class="b-top">' +
    '<a class="b-home" href="/posts/">Blog</a>' +
    '<nav class="b-nav">' +
    '<a href="/about/">소개</a>' +
    '<a href="https://lab.mascari4615.com/">KarmoLab</a>' +
    '<a href="/feed.xml">RSS</a>' +
    '</nav>' +
    '<button type="button" class="b-theme" aria-label="밝기">◐</button>' +
    '</header>'
  );
}

/**
 * 한 장 통째로
 * @param {{title:string, description?:string, permalink:string, bodyHtml:string, head?:string, bodyClass?:string, lastModified?:string}} opts
 */
export function blogPage({ title, description = '', permalink, bodyHtml, head = '', bodyClass = '', lastModified = '' }) {
  const url = SITE + permalink;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP_CONTENT}">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">\n` : ''}<meta property="og:site_name" content="Blog">
<meta property="og:title" content="${esc(title)}">
<meta property="og:url" content="${esc(url)}">
${description ? `<meta property="og:description" content="${esc(description)}">\n` : ''}${lastModified ? `<meta property="article:modified_time" content="${esc(lastModified)}">\n` : ''}<link rel="icon" href="/apps/karmolab/img/favicon.ico">
<link rel="alternate" type="application/rss+xml" href="/feed.xml">
<link rel="stylesheet" href="/apps/karmolab/css/fonts.css">
<link rel="stylesheet" href="/apps/karmolab/css/blog.css">
${head}
</head>
<body class="b-body${bodyClass ? ' ' + bodyClass : ''}">
${header()}
<main class="b-main">${bodyHtml}</main>
<footer class="b-foot"><a href="/posts/">글 목록</a><a href="https://mascari4615.com/">다른 주소</a></footer>
<script src="/apps/karmolab/js/blog-app.js" defer></script>
</body>
</html>
`;
}
