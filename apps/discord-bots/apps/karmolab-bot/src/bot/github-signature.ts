import { createHmac, timingSafeEqual } from 'node:crypto';

// GitHub webhook 서명 검증. X-Hub-Signature-256 은 원본 바이트의 HMAC-SHA256
export function isValidGithubSignature(rawBody: Buffer | undefined, header: unknown, secret: string): boolean {
  if (!rawBody || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function githubWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.KARMOLAB_BOT_GITHUB_WEBHOOK_SECRET ?? env.GITHUB_WEBHOOK_SECRET ?? '';
}
