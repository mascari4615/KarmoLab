import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'];

export async function captureFixture({ readOnly = false } = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'companion-fixture-'));
  const child = spawn('powershell', [
    ...psArgs, join(here, 'screen-window.ps1'), ...(readOnly ? ['-ReadOnly'] : []),
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  // Attach a rejection handler before awaiting readiness or capture.
  void closed.catch(() => {});
  let errorText = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { errorText += chunk; });
  try {
    const handle = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => finish(new Error(`Fixture readiness timeout: ${errorText}`)), 20_000);
      const onError = (error) => finish(error);
      const onExit = (code) => finish(new Error(`Fixture exited ${code}: ${errorText}`));
      const onData = (chunk) => {
        output += chunk;
        const ready = /^READY=(\d+)\r?$/m.exec(output);
        if (ready) finish(null, ready[1]);
      };
      function finish(error, value) {
        clearTimeout(timer);
        child.off('error', onError);
        child.off('exit', onExit);
        child.stdout.off('data', onData);
        if (error) reject(error);
        else resolve(value);
      }
      child.on('error', onError);
      child.on('exit', onExit);
      child.stdout.setEncoding('utf8').on('data', onData);
    });
    const outPath = join(folder, 'screen.png');
    const { stdout } = await run('powershell', [
      ...psArgs, join(here, '..', 'assets', 'capture-screen.ps1'),
      '-OutPath', outPath, '-WindowHandle', handle,
    ], { timeout: 60_000, windowsHide: true, encoding: 'utf8' });
    const tree = /^TREE=(.*)$/m.exec(stdout);
    if (!tree) throw new Error('Capture did not return TREE');
    const title = /^TITLE=(.*)$/m.exec(stdout)?.[1]?.trim();
    if (title !== 'CompanionScreenFixture') throw new Error(`Capture read another window: ${title}`);
    return { elements: JSON.parse(tree[1]), stdout, png: readFileSync(outPath) };
  } finally {
    if (child.exitCode === null) child.kill();
    await closed.catch(() => {});
    rmSync(folder, { recursive: true, force: true });
  }
}
