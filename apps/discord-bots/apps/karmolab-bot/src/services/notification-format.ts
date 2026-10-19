import type { GitHubCommit } from './digest-webhook';

/** Discord already supplies sender and time; routine notices need neither an embed nor repeated metadata. */
export function compactNotice(title: string, description: string, context = ''): string {
  const summary = description.replace(/```[\s\S]*?```/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  return [`**${title.replace(/^[\p{Extended_Pictographic}\s\uFE0F]+/u, '')}**`, summary.slice(0, 260), context].filter(Boolean).join(' | ').slice(0, 600);
}

const backgroundSubject = /^chore\((?:heartbeat|charstate)\):/;
const subject = (message: string): string => String(message).split(/\r?\n/, 1)[0].trim();
const safeText = (value: string): string => value.replace(/([\\`*_~\[\]<>])/g, '\\$1').replace(/@/g, '@\u200b');
const safeUrl = (value: string): string | null => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href.replace(/>/g, '%3E') : null; }
  catch { return null; }
};

/** Keep real changes in mixed pushes; only repetitive health/snapshot commits are omitted. */
export function compactPush(repo: string, commits: GitHubCommit[], compare?: string): string | null {
  const changes = commits.filter(commit => !backgroundSubject.test(subject(commit.message)));
  if (!changes.length) return null;
  const lines = changes.slice(0, 3).map(commit => {
    const hash = commit.id.replace(/[^a-f\d]/gi, '').slice(0, 7) || 'commit';
    const url = safeUrl(commit.url);
    return `${url ? `[\`${hash}\`](<${url}>)` : `\`${hash}\``} ${safeText(subject(commit.message).slice(0, 110))}`;
  });
  const label = safeText(repo.split('/').pop() || 'GitHub');
  if (changes.length === 1) return `**${label}** ${lines[0]}`;
  const url = compare ? safeUrl(compare) : null;
  const remaining = changes.length > lines.length ? `, 외 ${changes.length - lines.length}개` : '';
  return `**${label}** ${changes.length}개 변경${remaining}${url ? ` [전체](<${url}>)` : ''}\n${lines.join('\n')}`;
}
