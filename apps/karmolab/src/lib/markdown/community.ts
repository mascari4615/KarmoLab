/**
 * 커뮤니티 글의 서식. 공용 렌더러의 **user 신뢰 어댑터** (TASK-KL-098 → KL-354).
 *
 * 원래 여기 자작 escape 파서 (표, 이미지 없음). 렌더러 세 벌 갈림 방지로
 * `lib/markdown/render` 한 벌에 통합. 커뮤니티도 표, 이미지, callout 지원.
 * 안전: user 신뢰는 원문 HTML 을 전부 글자로 escape, `javascript:`, `data:`
 * 주소 생성 없음 (지키는 시험은 `npm run test:markdown`).
 *
 * marked(vendor)는 커뮤니티 위젯의 lazyScriptPaths 가 먼저 싣는다. 못 실렸으면
 * escape 한 글자만. 서식 없음이 스크립트 실행보다 안전.
 * 자리: `src/lib/` 공용 (blog 댓글, 커뮤니티, WM 허브가 같이 씀. 2026-09-24 widgets/ 에서 이동)
 */
import { renderMarkdown as renderShared, escapeHtml as escapeShared } from './render';
import { splitFrontMatter, coverImage } from './frontmatter';

export const escapeHtml = escapeShared;

/** 글 맨 앞의 `---` 덩어리 = 설정이다 (블로그 글과 같은 문법). 본문으로도 미리보기로도 안 샌다. */
export function postCover(source: string): string | null {
    return coverImage(splitFrontMatter(String(source ?? '')).meta);
}

/** 글 한 편을 화면에 넣을 수 있는 HTML 로. */
export function renderMarkdown(source: string): string {
    const body = splitFrontMatter(String(source ?? '')).body;
    if (typeof marked === 'undefined' || typeof marked.Marked !== 'function') {
        // marked 가 안 실린 화면. 서식 없이, 그러나 안전하게.
        return `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`;
    }
    const html = renderShared(body, { trust: 'user', marked, breaks: true });
    // 화면의 큰제목과 안 부딪히게 글 안 제목은 h3~h5 로 내린다 (자작 파서 시절 규칙 유지).
    return html
        .replace(/<(\/?)h3>/g, '<$1h5>')
        .replace(/<(\/?)h2>/g, '<$1h4>')
        .replace(/<(\/?)h1>/g, '<$1h3>');
}

/** 목록에 쓸 한 줄 미리보기. 서식 기호는 걷어내고 글만 남긴다. */
export function plainPreview(source: string, max = 90): string {
    const text = splitFrontMatter(String(source ?? '')).body
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_~>#-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
}
