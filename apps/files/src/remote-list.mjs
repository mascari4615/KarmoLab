/** 원격 목록 한 판. 이름, 크기, MD5 만. 본문은 안 받는다 */
import { spawn } from 'node:child_process';

const ARGS = ['lsjson', '-R', '--files-only', '--hash', '--hash-type', 'md5', '--no-mimetype', '--fast-list', '--tpslimit', '8'];

/** `modtime` 을 빼면 Drive 가 시각을 안 붙여 조금 빠르다. 기준선 적기만 시각이 필요 */
export function listRemote(remote, { modtime = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('rclone', [...ARGS, ...(modtime ? [] : ['--no-modtime']), remote], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(Buffer.concat(err).toString().trim() || `rclone ${code}`));
      try {
        resolve(JSON.parse(Buffer.concat(out).toString()));
      } catch (e) {
        reject(e);
      }
    });
  });
}
