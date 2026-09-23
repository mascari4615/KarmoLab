// Shared source sections and comment removal for generation and coverage offsets.
export const DEFERRED = ['명령 팔레트'];
export const isDeferred = (title) => DEFERRED.some((prefix) => title.startsWith(prefix));

export function sections(text) {
  const lines = text.split('\n');
  const marks = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\/\*\s*═+/.test(lines[i])) {
      const inline = lines[i].replace(/^\/\*\s*═+\s*/, '').replace(/\s*═+.*$/, '').trim();
      marks.push({ line: i, title: inline || (lines[i + 1] || '').trim() });
    }
  }
  if (!marks.length) throw new Error('[split-css] 구역 배너를 못 찾았다. toolbox.css 머리 모양 확인');
  return marks.map((mark, i) => ({
    title: mark.title,
    text: lines.slice(i === 0 ? 0 : mark.line, i + 1 < marks.length ? marks[i + 1].line : lines.length).join('\n')
  }));
}

export function stripComments(css) {
  let out = '';
  let quote = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += css[++i] ?? ''; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    out += c;
  }
  const NL = String.fromCharCode(10);
  return out.split(NL).map((line) => line.replace(/[ \t]+$/, '')).filter((line, i, lines) => line.trim() !== '' || (lines[i - 1] || '').trim() !== '').join(NL);
}

// Match all emitted sections in order; stale or foreign CSS cannot produce a map.
export function criticalSectionRanges(source, emitted) {
  if (!emitted.startsWith('/*') || emitted.indexOf('*/') < 0) throw new Error('shell-critical.css 생성 머리말 없음');
  let cursor = emitted.indexOf('*/') + 2;
  const ranges = [];
  for (const section of sections(source).filter((section) => !isDeferred(section.title))) {
    const text = stripComments(section.text).trim();
    if (!text) continue;
    const start = emitted.indexOf(text, cursor);
    if (start < 0 || emitted.slice(cursor, start).trim()) throw new Error('CSS 원본과 생성물 불일치: ' + section.title);
    ranges.push({ title: section.title, start: cursor, end: start + text.length });
    cursor = start + text.length;
  }
  if (!ranges.length || emitted.slice(cursor).trim()) throw new Error('CSS 구역에 속하지 않은 생성 내용');
  ranges[ranges.length - 1].end = emitted.length;
  return ranges;
}
