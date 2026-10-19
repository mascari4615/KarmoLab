import { describe, expect, it } from 'vitest';
import { compactNotice, compactPush } from './notification-format';

const commit = (message: string, id = 'abcdef1234567') => ({ id, message, url: `https://github.com/owner/repo/commit/${id}`, added: [], modified: [] });
describe('compact Discord notices', () => {
  it('retains commit title and link while removing body and trailers', () => {
    const content = compactPush('owner/repo', [commit('fix: visible change\r\n\r\nLong explanation\nCo-Authored-By: someone')])!;
    expect(content).toContain('fix: visible change');
    expect(content).toContain('https://github.com/owner/repo/commit/');
    expect(content).not.toMatch(/Long explanation|Co-Authored|\n/);
  });
  it('omits background-only pushes but keeps real changes in mixed pushes', () => {
    expect(compactPush('owner/memo', [commit('chore(heartbeat): alive'), commit('chore(charstate): snapshot')])).toBeNull();
    expect(compactPush('owner/memo', [commit('chore(heartbeat): alive'), commit('fix: actual change')])).toContain('actual change');
    expect(compactPush('owner/memo', [commit('fix: heartbeat repair')])).toContain('heartbeat repair');
  });
  it('bounds large pushes and links to the rest', () => {
    const content = compactPush('owner/repo', Array.from({ length: 40 }, () => commit('x'.repeat(1000))), 'https://github.com/owner/repo/compare/a...b')!;
    expect(content.split('\n')).toHaveLength(4);
    expect(content).toContain('외 37개');
    expect(content.length).toBeLessThan(900);
  });
  it('does not turn commit text into a mention or arbitrary link', () => {
    const content = compactPush('owner/repo', [{ ...commit('@everyone [fake](x)'), url: 'javascript:alert(1)' }])!;
    expect(content).not.toContain('@everyone');
    expect(content).not.toContain('javascript:');
    expect(content).toContain('\\[fake\\]');
  });
  it('keeps an operational summary while removing its stack block and repeated whitespace', () => {
    const text = compactNotice('🔴 벼루 에러', '**메시지**: failure\n```\nstack\n```', 'prod/host');
    expect(text).toBe('**벼루 에러** | 메시지: failure | prod/host');
  });
});
