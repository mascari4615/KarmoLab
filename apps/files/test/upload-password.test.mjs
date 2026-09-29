import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDecryptCommand, loadStoredPassword, secretPath } from '../src/upload-password.mjs';

test('저장 파일이 없으면 null, PowerShell 은 안 부른다', async () => {
  let ran = false;
  const got = await loadStoredPassword({
    existsFn: async () => false,
    run: async () => {
      ran = true;
      return 'never';
    },
  });
  assert.equal(got, null);
  assert.equal(ran, false);
});

test('저장 파일이 있으면 PowerShell(DPAPI 복호) 결과를 그대로 반환', async () => {
  let calledWith = null;
  const got = await loadStoredPassword({
    existsFn: async () => true,
    run: async (cmd, args) => {
      calledWith = { cmd, args };
      return 'sekret-value';
    },
  });
  assert.equal(got, 'sekret-value');
  assert.equal(calledWith.cmd, 'powershell');
  assert.ok(calledWith.args.join(' ').includes('ConvertTo-SecureString'));
});

test('복호 결과가 빈 문자열이면 null', async () => {
  const got = await loadStoredPassword({ existsFn: async () => true, run: async () => '' });
  assert.equal(got, null);
});

test('앞뒤 공백은 trim 뒤 반환', async () => {
  const got = await loadStoredPassword({ existsFn: async () => true, run: async () => '  abc123  \r\n' });
  assert.equal(got, 'abc123');
});

test('run 이 던지면 예외 없이 null (PowerShell, DPAPI 실패도 저장 안 됨과 같게)', async () => {
  const got = await loadStoredPassword({
    existsFn: async () => true,
    run: async () => {
      throw new Error('powershell not found');
    },
  });
  assert.equal(got, null);
});

test('경로는 LOCALAPPDATA\\karmo-files\\upload.secret', () => {
  const p = secretPath();
  assert.ok(p.includes('karmo-files'));
  assert.ok(p.endsWith('upload.secret'));
});

test('PowerShell 명령 인자에 평문 비밀번호를 담지 않는다', () => {
  const { args } = buildDecryptCommand('C:/x/upload.secret');
  const joined = args.join(' ');
  assert.ok(joined.includes('SecureStringToBSTR'));
  assert.ok(!joined.includes('AsPlainText'));
});
