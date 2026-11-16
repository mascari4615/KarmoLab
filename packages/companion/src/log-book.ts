/**
 * 기록장. 서버가 stdout, stderr 로 내는 글을 파일과 메모리에도 받아 둔다.
 *
 * 왜: 런처가 동반자를 터미널 창 없이 띄우게 됐다 (사용자 2026-11-16 "터미널 기본적으로 숨기고,
 * 로그 같은 것도 터미널이 아니라 다른 곳에서 볼 수 있어야"). 창이 없으면 글이 갈 데가 없어서
 * 여기 받아 두고, 설정 판의 기록 탭 (`/logs`) 과 「터미널로 보기」 가 이걸 읽는다.
 *
 * console 만 감싸면 두뇌가 `process.stderr.write` 로 바로 쓰는 줄을 놓친다. 그래서 write 자체를 감싼다.
 * 원래 write 는 그대로 부른다. 터미널이 떠 있으면 거기에도 똑같이 보인다.
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';

export interface LogBookOptions {
  /** 이어 쓸 파일. 없으면 메모리에만 */
  file?: string;
  /** 메모리에 남길 줄 수 */
  keep?: number;
  /** 파일이 이보다 크면 시작할 때 `.1` 로 밀어 둔다 */
  rotateBytes?: number;
  /** 감쌀 흐름. 기본 stdout, stderr */
  streams?: NodeJS.WriteStream[];
  /** 줄 앞 시각. 시험에서 고정 */
  now?: () => Date;
}

export interface LogBook {
  readonly file: string | null;
  /** 최근 줄 (오래된 것 먼저) */
  lines(): string[];
  /** 감싼 write 를 되돌린다 */
  stop(): void;
}

const DEFAULT_KEEP = 2000;
const DEFAULT_ROTATE_BYTES = 2 * 1024 * 1024;

const stamp = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

export function startLogBook(options: LogBookOptions = {}): LogBook {
  const keep = options.keep ?? DEFAULT_KEEP;
  const now = options.now ?? (() => new Date());
  const streams = options.streams ?? [process.stdout, process.stderr];
  const kept: string[] = [];
  let out: WriteStream | null = null;
  if (options.file !== undefined) {
    mkdirSync(dirname(options.file), { recursive: true });
    if (existsSync(options.file) && statSync(options.file).size > (options.rotateBytes ?? DEFAULT_ROTATE_BYTES)) {
      renameSync(options.file, `${options.file}.1`);
    }
    out = createWriteStream(options.file, { flags: 'a' });
    // 기록장이 못 쓴다고 서버가 죽으면 안 된다. 메모리 쪽은 계속 남는다
    out.on('error', () => { out = null; });
  }

  // 흐름마다 덜 끝난 줄. stdout 과 stderr 가 한 줄에 섞이지 않게 따로 모은다
  const partial = new Map<NodeJS.WriteStream, string>();
  const undo: Array<() => void> = [];

  const take = (stream: NodeJS.WriteStream, chunk: unknown): void => {
    const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) || chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : '';
    if (text === '') return;
    const pieces = ((partial.get(stream) ?? '') + text).split('\n');
    partial.set(stream, pieces.pop() ?? '');
    const prefix = stream === process.stderr ? '! ' : '';
    for (const piece of pieces) {
      const line = `${stamp(now())} ${prefix}${piece.replace(/\r$/, '')}`;
      kept.push(line);
      out?.write(line + '\n');
    }
    if (kept.length > keep) kept.splice(0, kept.length - keep);
  };

  for (const stream of streams) {
    const original = stream.write;
    const wrapped = function (this: NodeJS.WriteStream, chunk: unknown, ...rest: unknown[]): boolean {
      take(stream, chunk);
      return (original as (...args: unknown[]) => boolean).call(this, chunk, ...rest);
    };
    stream.write = wrapped as typeof stream.write;
    undo.push(() => { stream.write = original; });
  }

  return {
    file: options.file ?? null,
    lines: () => kept.slice(),
    stop: () => {
      for (const u of undo) u();
      out?.end();
      out = null;
    },
  };
}
