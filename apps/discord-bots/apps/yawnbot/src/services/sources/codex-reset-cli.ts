import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const RESET_PROVIDERS = ['claude', 'codex', 'grok'] as const;
export type ResetProvider = typeof RESET_PROVIDERS[number];

function commandFor(provider: ResetProvider): { command: string; prefix: string[] } {
  const configured = process.env[`YAWNBOT_${provider.toUpperCase()}_COMMAND`]?.trim();
  const home = process.env.YAWNBOT_AI_USER_HOME || os.homedir();
  const candidates = configured ? [configured] : provider === 'codex'
    ? [path.join(home, 'AppData/Local/Programs/OpenAI/Codex/bin/codex.exe'), path.join(home, 'AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js'), 'codex']
    : provider === 'claude' ? [path.join(home, '.local/bin/claude.exe'), 'claude']
      : [path.join(home, '.grok/bin/grok.exe'), 'grok'];
  const command = candidates.find(c => fs.existsSync(c)) || candidates[candidates.length - 1];
  if (/\.m?js$/i.test(command)) return { command: process.execPath, prefix: [command] };
  if (/\.(cmd|bat|ps1)$/i.test(command)) throw new Error(`${provider} CLI는 실행파일 또는 JavaScript 진입점 필요`);
  return { command, prefix: [] };
}

export function resetCliArgs(provider: ResetProvider, promptFile: string, outputFile: string, instruction: string): string[] {
  if (provider === 'claude') return ['--print', '--no-session-persistence', '--safe-mode', '--strict-mcp-config', '--tools', '', '--permission-mode', 'dontAsk', '--system-prompt', instruction];
  if (provider === 'codex') return ['--ask-for-approval', 'never', 'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--sandbox', 'read-only',
    '-c', 'features.shell_tool=false', '-c', 'web_search="disabled"', '--color', 'never', '--output-last-message', outputFile, '-'];
  return ['--prompt-file', promptFile, '--output-format', 'plain', '--tools', '', '--deny', '*', '--no-subagents', '--disable-web-search',
    '--permission-mode', 'dontAsk', '--max-turns', '1', '--system-prompt-override', instruction];
}

export async function generateResetCliText(provider: ResetProvider, prompt: string, instruction: string): Promise<string> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'yb-reset-analysis-'));
  const promptFile = path.join(cwd, 'input.txt');
  const outputFile = path.join(cwd, 'output.txt');
  fs.writeFileSync(promptFile, prompt, { mode: 0o600 });
  const env = { ...process.env };
  // 봇의 다른 서비스 비밀값은 CLI 자식에게 전달하지 않음. 인증은 각 CLI의 저장된 로그인 사용
  for (const key of Object.keys(env)) if (/(TOKEN|SECRET|API_KEY|PRIVATE_KEY|PASSWORD)/i.test(key)) delete env[key];
  delete env.CLAUDECODE;
  if (provider === 'grok') {
    env.GROK_DISABLE_AUTOUPDATER = '1';
    env.GROK_MEMORY = '0';
    for (const vendor of ['CURSOR', 'CLAUDE']) for (const feature of ['SKILLS', 'RULES', 'AGENTS', 'MCPS', 'HOOKS']) {
      env[`GROK_${vendor}_${feature}_ENABLED`] = '0';
    }
  }
  const home = process.env.YAWNBOT_AI_USER_HOME;
  if (home) {
    env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
    env.CODEX_HOME = path.join(home, '.codex');
    env.GROK_HOME = path.join(home, '.grok');
  }
  try {
    const invocation = commandFor(provider);
    const flags = resetCliArgs(provider, promptFile, outputFile, instruction);
    const model = process.env[`YAWNBOT_${provider.toUpperCase()}_MODEL`]?.trim();
    if (model) flags.unshift('--model', model);
    const args = [...invocation.prefix, ...flags];
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(invocation.command, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let failure: string | null = null;
      const stop = (reason: string) => {
        if (failure) return;
        failure = reason;
        if (process.platform === 'win32' && child.pid) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else child.kill('SIGKILL');
      };
      const timer = setTimeout(() => stop('응답 시간 초과'), 180_000);
      child.stdout.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 100_000) stop('응답 크기 초과'); });
      child.stderr.on('data', () => {});
      child.stdin.on('error', () => {});
      child.on('error', () => { clearTimeout(timer); reject(new Error(`${provider} CLI 실행 불가`)); });
      child.on('close', code => {
        clearTimeout(timer);
        if (failure || code !== 0) return reject(new Error(`${provider} CLI ${failure || `종료 ${code}. 로그인/사용량 확인 필요`}`));
        const text = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8').trim() : stdout.trim();
        if (!text) return reject(new Error(`${provider} CLI 빈 응답`));
        resolve(text);
      });
      child.stdin.end(provider === 'grok' ? undefined : provider === 'codex' ? `${instruction}\n\n${prompt}` : prompt);
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}
