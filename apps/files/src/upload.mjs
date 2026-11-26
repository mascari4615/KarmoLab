#!/usr/bin/env node
/**
 * 열람 트리 → 클라우드 암호문 → rclone 원격.
 * 원본 경로는 env 만. 기본 로그는 개수. 이름 나열은 --verbose.
 *
 * FILES_VAULT_ROOT  FILES_VAULT_PASS  FILES_VAULT_REMOTE
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createVault, flushIndex, listFiles, putThumb, unlockVault } from './vault.mjs';
import { putFileFromPath, sha256File, takenAtOf } from './vault-node.mjs';
import { rcloneStore, startRcloneDaemon } from './store-rclone.mjs';
import { teeStore } from './store-tee.mjs';
import { indexLock } from './index-lock.mjs';
import { attachSums } from './sums.mjs';
import { walkFiles } from './walk.mjs';
import { mirrorable } from './mirror-policy.mjs';
import { thumbKind } from './thumb.mjs';
import { hasFfmpeg, makeThumb, probeVideo } from './thumb-node.mjs';
import { budgetLine, capFromEnv, makeBudget, measureRemote } from './mirror-budget.mjs';
import { loadFilesEnv } from './env-file.mjs';
import { loadStoredPassword } from './upload-password.mjs';

await loadFilesEnv();

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`없음: ${name}`);
    process.exit(2);
  }
  return v;
}

/**
 * 비밀번호는 사용자 입력이 기본, 대타 없음.
 * 우선순위: 명시 FILES_VAULT_PASS(env/.env) > scripts/save-upload-password.ps1 저장값.
 * 둘 다 없으면 기존 동작(에러 종료) + 저장 안내 한 줄.
 */
async function resolvePassword() {
  const fromEnv = process.env.FILES_VAULT_PASS;
  if (fromEnv) return fromEnv;
  const stored = await loadStoredPassword();
  if (stored) return stored;
  console.error('없음: FILES_VAULT_PASS');
  console.error('scripts/save-upload-password.ps1 로 한 번 저장해 두면 이후 자동으로 읽는다');
  process.exit(2);
}

const root = need('FILES_VAULT_ROOT');
const pass = await resolvePassword();
const remote = process.env.FILES_VAULT_REMOTE || 'gdrive:karm-files-vault';
const extraRemote = process.env.FILES_VAULT_R2 || '';
const dry = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt === -1 ? '' : process.argv[onlyAt + 1];
if (onlyAt !== -1 && (!only || only.split(/[\\/]/).some((part) => !part || part === '.' || part === '..'))) {
  throw new Error('--only 는 원본 뿌리 아래의 상대 폴더 하나여야 함');
}

// 우선 올릴 폴더도 원격에서는 원래 상대 경로를 지킨다.
const scanRoot = only ? join(root, ...only.split(/[\\/]/)) : root;
const scanned = await walkFiles(scanRoot);
const files = only
  ? scanned.map((file) => ({ ...file, rel: only.replaceAll('\\\\', '/') + '/' + file.rel }))
  : scanned;
console.log(`파일 ${files.length}개`);
if (dry) {
  if (verbose) for (const f of files) console.log(f.rel);
  process.exit(0);
}

/* 데몬은 remote 를 안 가린다. rc 한 판에 여러 원격을 태운다.
   예전엔 열람 저장이 켜지면 데몬을 아예 안 띄웠는데, 그러면 청크마다 rclone 프로세스를
   새로 띄워 몇 배로 느려진다. 열람 저장을 켠 값을 속도로 치를 이유가 없다. */
const daemon = await startRcloneDaemon();
const rcUrl = daemon?.url;
const primary = rcloneStore(remote, { rcUrl, delayMs: rcUrl ? 0 : 400 });
const extra = extraRemote ? rcloneStore(extraRemote, { rcUrl, delayMs: rcUrl ? 0 : 400 }) : null;

/* 값 상한. 시작 총량을 한 번 재고 보내는 바이트를 더해 간다.
   못 재면 막지 않는다. 모른다는 이유로 정본 전송을 세우지 않는다.
   `hdr`, `idx` 는 상한 밖이다. 그게 R2 에 없으면 화면이 클라우드 자체를 못 연다. */
const capGb = capFromEnv();
const startBytes = extra ? await measureRemote(extraRemote) : null;
const budget = startBytes === null ? null : makeBudget(startBytes, capGb);
if (budget) console.log('열람 저장', budgetLine(budget.state()));
else if (extra) console.log('열람 저장 총량을 못 쟀다. 상한 검사 생략');
let budgetTold = false;
function allowExtra(key, bytes) {
  if (key === 'hdr' || key === 'idx') return true;
  if (!budget) return true;
  const ok = budget.allow(bytes);
  if (!ok && !budgetTold) {
    budgetTold = true;
    console.log(`열람 저장 ${budgetLine(budget.state())}. 이후 정본만 올린다`);
  }
  return ok;
}

const mirrored = extra ? teeStore(primary, extra, { allowExtra }) : primary;
const store = mirrored;
let session;
const hdr = await store.get('hdr');
/* 일시 오류의 not found 문구도 null 로 온다. 그때 새로 만들면 새 소금으로 hdr 을 덮어 전부 못 연다 */
if (hdr) session = await unlockVault(store, pass);
else if (process.argv.includes('--init')) session = await createVault(store, pass);
else {
  console.error('hdr 을 못 받았다. 처음 만드는 저장소면 --init. 아니면 원격 상태부터 확인');
  daemon?.stop();
  process.exit(2);
}
session.deferIndex = true;
session.indexLock = indexLock();
/* 암호문 MD5 장부. 정본에만 둔다 (`npm run verify`) */
const ledger = attachSums(session, primary);
/* 색인은 9MB 다. Drive 에 한 번 쓰는 데 4초쯤이고 R2 에도 쓴다 (2026-11-26). 10개마다 쓰면
   작은 파일에서는 그 시간이 절반에 가깝다. 개수 대신 시간으로 끊는다. 중간에 죽으면 이만큼만 다시 올린다 */
const FLUSH_MS = 60_000;
let flushedAt = Date.now();
console.log('클라우드 염');

/* 진행 상태를 **정해진 자리**에 적는다.
   왜: 터미널에서 띄우면 로그 자리는 띄운 쪽이 정한다. 그러면 데스크톱 앱이 그 로그를 못 찾아
   진행 수치는 안 보입니다가 된다(2026-08-27 조수님이 그 화면을 봤다). 누가 띄우든
   같은 자리에 적으면 앱이 읽는다. 여기 적는 것은 **집계 수치뿐**. 경로, 파일 이름은 안 적는다. */
const progressPath = new URL('../.upload-progress.json', import.meta.url);
/** 열람 저장(R2)에 보낸 수. writeProgress 가 첫 호출부터 읽으므로 그 위에 선다. */
let mirroredCount = 0;
async function writeProgress(stage, total, done, uploaded, skipped) {
  const body = JSON.stringify({
    stage,
    total,
    done,
    uploaded,
    skipped,
    // 열람 저장(R2)에 보낸 수. R2 로 가긴 하나를 눈으로 셀 수 있어야 한다 . 
    // 안 그러면 안 가는 건지 지금 올리는 게 영상뿐인 건지 구분이 안 된다.
    mirrored: mirroredCount,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  });
  try {
    await writeFile(progressPath, body);
  } catch {
    /* 상태를 못 적는다고 올리기를 멈출 이유는 없다 */
  }
}
await writeProgress('index', files.length, 0, 0, 0);

const have = new Map((await listFiles(session)).map((f) => [f.path, f.sha256]));
/* ffmpeg 이 없으면 미리보기만 건너뛴다. 그것 때문에 올리기를 멈출 이유는 없다 */
const thumbsOn = await hasFfmpeg();
if (!thumbsOn) console.log('ffmpeg 없음. 미리보기는 안 굽는다');
let thumbCount = 0;
let n = 0;
let skipped = 0;
/* 파일 단위 동시 전송. 한 파일씩이면 작은 파일이 Drive 왕복에 묶인다 (평평한 키 순차 27/분, 동시 8 은 212/분, 2026-11-26).
   청크는 파일마다 저장소를 넘겨 받는다. 세션 저장소는 색인용으로 열람 저장까지 묶인 것 그대로 */
const PARALLEL = Math.max(1, Number(process.env.FILES_UPLOAD_PARALLEL) || 8);
session.store = mirrored;
let flushing = null;
function flushIfDue() {
  if (flushing) return flushing;
  if (Date.now() - flushedAt < FLUSH_MS) return null;
  flushing = flushIndex(session).finally(() => {
    flushedAt = Date.now();
    flushing = null;
  });
  return flushing;
}
async function one(f) {
  const rel = f.rel.replaceAll('\\', '/');
  const known = have.get(rel);
  if (known && known === (await sha256File(f.abs))) {
    skipped += 1;
    return;
  }
  /* 영상은 크기까지 봐야 판단 (mirror-policy: 큰 영상은 화면이 못 염) */
  const toMirror = mirrorable(rel, f.size);
  if (toMirror) mirroredCount += 1;
  /* 시각도 같이. 사진은 디스크 수정 시각이 옮긴 날로 덮이는 일이 잦아 찍은 날을 따로 읽음.
     영상은 컨테이너가 적어 둔 촬영 시각. ffprobe 는 미리보기와 한 판 */
  const video = thumbsOn && thumbKind(rel, f.size) === 'video' ? await probeVideo(f.abs) : null;
  const shot = video ? video.createdAt : await takenAtOf(f.abs, rel);
  await putFileFromPath(session, rel, f.abs, {
    chunkSize: 8 * 1024 * 1024,
    mtime: f.mtime,
    shot,
    store: toMirror ? mirrored : primary,
  });
  /* 미리보기는 늘 열람 저장까지. 원본을 안 올리는 큰 영상도 칸은 보여야 하고, 한 장이 수십 KB */
  const thumb = thumbsOn ? await makeThumb(f.abs, rel, f.size, { duration: video?.duration }) : null;
  if (thumb) {
    await putThumb(session, rel, thumb, { store: mirrored });
    thumbCount += 1;
  }
  n += 1;
  if (verbose) console.log(rel);
}
try {
  let next = 0;
  let failure = null;
  let told = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, files.length) }, async () => {
      while (next < files.length && !failure) {
        const f = files[next++];
        try {
          await one(f);
          await flushIfDue();
        } catch (e) {
          /* 색인 쓰기 실패도 여기로. 밖으로 던지면 나머지 일꾼이 도는 채로 finally 가 데몬을 내림 */
          failure ??= e;
          return;
        }
        const done = n + skipped;
        if (done - told >= 10 || done === files.length) {
          told = done;
          if (!verbose) console.log(`${done}/${files.length} 올림 ${n} 건너뜀 ${skipped}`);
          await writeProgress('upload', files.length, done, n, skipped);
        }
      }
    }),
  );
  if (failure) throw failure;
  await flushing;
  await flushIndex(session);
  await writeProgress('done', files.length, n + skipped, n, skipped);
} finally {
  await flushing?.catch(() => {});
  if (!(await ledger.flush())) console.error(`MD5 장부를 못 썼다. 남은 줄 ${ledger.pending}`);
  await flushIndex(session);
  daemon?.stop();
}
console.log(`올림 ${n} 건너뜀 ${skipped} 미리보기 ${thumbCount}`);
