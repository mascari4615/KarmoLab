/** 검증과 소급이 같이 쓰는 여는 절차. 색인, 원격 목록, 장부를 **이 순서로** 읽는다 */
import { loadFilesEnv } from './env-file.mjs';
import { listRemote } from './remote-list.mjs';
import { rcloneStore } from './store-rclone.mjs';
import { readSums, SUMS_DIR } from './sums.mjs';
import { loadStoredPassword } from './upload-password.mjs';
import { unlockVault } from './vault.mjs';

export async function openForCheck({ modtime = false } = {}) {
  await loadFilesEnv();
  const pass = process.env.FILES_VAULT_PASS || (await loadStoredPassword());
  if (!pass) throw new Error('없음: FILES_VAULT_PASS');
  const remote = process.env.FILES_VAULT_REMOTE || 'gdrive:karm-files-vault';
  const store = rcloneStore(remote, { tries: 3, retryBaseMs: 3000 });
  /* 색인이 먼저. 목록을 먼저 뜨면 그 뒤에 올라온 파일이 없는 것으로 보인다 */
  const session = await unlockVault(store, pass);
  const t = performance.now();
  const listing = await listRemote(remote, { modtime });
  const listMs = performance.now() - t;
  const keys = listing.map((o) => o.Path).filter((p) => p.startsWith(`${SUMS_DIR}/`));
  const { sums, bad } = await readSums(session, store, keys);
  return { session, store, remote, listing, sums, segments: keys.length, badSegments: bad, listMs };
}
