#!/usr/bin/env node
/**
 * save-upload-password.ps1 전용 저비용 확인.
 * FILES_VAULT_PASS(이 프로세스 env 한정)로 hdr 수신, 열쇠 유도, idx 복호까지 시도.
 * 청크는 안 받음. rclone, 네트워크, FILES_VAULT_REMOTE 중 하나라도 없으면 종료 2(확인 생략 신호).
 * 종료 0 맞음, 종료 1 비밀번호 틀림.
 */
import { loadFilesEnv } from '../src/env-file.mjs';
import { rcloneStore } from '../src/store-rclone.mjs';
import { unlockVault, VaultError } from '../src/vault.mjs';

await loadFilesEnv();

const pass = process.env.FILES_VAULT_PASS;
if (!pass) {
  console.error('no-pass');
  process.exit(2);
}
const remote = process.env.FILES_VAULT_REMOTE || 'gdrive:karm-files-vault';

try {
  const store = rcloneStore(remote, { tries: 1, retryBaseMs: 1000 });
  await unlockVault(store, pass);
  console.log('ok');
  process.exit(0);
} catch (e) {
  if (e instanceof VaultError) {
    console.error('wrong-password');
    process.exit(1);
  }
  console.error('skip: ' + (e && e.message ? e.message : e));
  process.exit(2);
}
