/**
 * 상한까지 기다리다 끝난 대기를 적는 추적기 (2026-09-25)
 *
 * 왜: `waitForFunction(..., { timeout: 90000 }).catch(() => undefined)` 모양이 검사 95곳.
 *   조건이 틀리면 매번 상한을 꽉 채우고 조용히 넘어감. regionwatch 가 그 모양으로 144초 중 90초.
 *   코드만 봐서는 어느 것이 실제로 상한까지 가는지 모름. 돌려서 측정
 *
 * 사용: npm run gates:trace-waits (실행기가 자식 검사마다 이 파일을 --import 로 실음)
 *   상한까지 간 대기마다 stderr 에 `[wait-timeout] <파일>:<줄> <ms>ms` 한 줄
 */
import { chromium } from 'playwright';

const METHODS = ['waitForFunction', 'waitForSelector', 'waitForURL', 'waitForEvent', 'waitForResponse', 'waitForRequest', 'waitForLoadState'];
const patched = new WeakSet();

function callerOf(stack) {
  for (const line of String(stack).split('\n').slice(1)) {
    const m = /scripts[\\/]([\w.-]+\.mjs):(\d+)/.exec(line);
    if (m && m[1] !== 'wait-tracer.mjs') return `${m[1]}:${m[2]}`;
  }
  return '?';
}

function patchProto(proto) {
  if (!proto || patched.has(proto)) return;
  patched.add(proto);
  for (const name of METHODS) {
    const orig = proto[name];
    if (typeof orig !== 'function') continue;
    proto[name] = function traced(...args) {
      const where = callerOf(new Error().stack);
      const started = Date.now();
      return orig.apply(this, args).catch((err) => {
        if (err && err.name === 'TimeoutError') process.stderr.write(`[wait-timeout] ${where} ${Date.now() - started}ms\n`);
        throw err;
      });
    };
  }
}

function patchBrowser(browser) {
  const wrapPage = (page) => { patchProto(Object.getPrototypeOf(page)); return page; };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => wrapPage(await newPage(...a));
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => {
    const ctx = await newContext(...a);
    const cNewPage = ctx.newPage.bind(ctx);
    ctx.newPage = async (...b) => wrapPage(await cNewPage(...b));
    return ctx;
  };
  return browser;
}

const typeProto = Object.getPrototypeOf(chromium);
const launch = typeProto.launch;
typeProto.launch = async function tracedLaunch(...args) {
  return patchBrowser(await launch.apply(this, args));
};
