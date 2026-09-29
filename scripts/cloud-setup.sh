#!/usr/bin/env bash
# 클라우드 컨테이너 (Claude Code 원격 세션 등) 에서 게이트를 돌릴 준비를 한 번에 한다.
#
# 왜: 이 저장소의 검사는 브라우저와 산출물과 로컬 패키지를 전제한다. 새 컨테이너는 그게 없어
#   순서를 모르면 헤맨다 (2026-09-29 실측: 설치 실패, typecheck 실패, 브라우저 못 뜸, 빈 산출물).
#   각 단계는 멱등이라 두 번 돌려도 안전하다. 세션 시작에 자동으로 돌지 않는다 (필요할 때만 부른다).
# 정본 절차 문서: memo/projects/karmolab/reference/cloud-gates-2026-09-29.md
#
# 사용:
#   bash scripts/cloud-setup.sh            # 설치 + 브라우저 + 산출물
#   bash scripts/cloud-setup.sh --bot      # 위에 더해 karmolab-bot 빌드 (test:chat, test:copresence 용)
#   bash scripts/cloud-setup.sh --check    # 아무것도 안 바꾸고 준비 상태만 보고 (없으면 종료값 1)
#
# 끝나면 한글 파일 이름을 받는 검사용으로 이 환경 변수를 켜고 돌린다:
#   export LANG=C.UTF-8 LC_ALL=C.UTF-8
#
# 하지 않는 것: 통짜 `npm run build` (gen:related 가 HuggingFace 모델을 받다 막힘), 시스템 패키지 설치.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAB="$ROOT/apps/karmolab"
WITH_BOT=0
CHECK_ONLY=0
for a in "$@"; do
  case "$a" in
    --bot) WITH_BOT=1 ;;
    --check) CHECK_ONLY=1 ;;
    *) echo "[cloud-setup] 모르는 인자: $a" >&2; exit 2 ;;
  esac
done

MISSING=0
say() { echo "[cloud-setup] $*"; }
need() { # 이름, 준비됐나(0/1)
  if [ "$2" = 1 ]; then say "OK    $1"; else say "없음  $1"; MISSING=$((MISSING + 1)); fi
}
has_dir() { [ -d "$1" ] && [ -n "$(ls -A "$1" 2>/dev/null)" ] && echo 1 || echo 0; }

# --- 1. 의존성 (--ignore-scripts: onnxruntime-node 의 postinstall 이 바이너리 다운로드에서 막힌다) ---
install_dep() { # 디렉터리
  local dir="$1"
  [ -f "$dir/package-lock.json" ] || return 0
  if [ "$(has_dir "$dir/node_modules")" = 1 ]; then return 0; fi
  [ "$CHECK_ONLY" = 1 ] && return 0
  say "npm ci --ignore-scripts  ($dir)"
  (cd "$dir" && npm ci --ignore-scripts >/dev/null 2>&1) || say "실패: $dir 설치"
}
for d in "$LAB" "$ROOT/packages/ai" "$ROOT/packages/companion" "$ROOT/packages/mcp" "$ROOT/packages/badapple" "$ROOT/apps/discord-bots"; do
  install_dep "$d"
  [ -f "$d/package-lock.json" ] && need "의존성 ${d#$ROOT/}" "$(has_dir "$d/node_modules")"
done

# --- 2. badapple 는 로컬 패키지라 빌드 산출물이 있어야 typecheck 가 통과한다 ---
BA="$ROOT/packages/badapple"
if [ ! -f "$BA/dist/index.js" ] && [ "$CHECK_ONLY" = 0 ] && [ "$(has_dir "$BA/node_modules")" = 1 ]; then
  say "packages/badapple 빌드"
  (cd "$BA" && npm run -s build >/dev/null 2>&1) || say "실패: badapple 빌드"
fi
need "packages/badapple/dist" "$([ -f "$BA/dist/index.js" ] && echo 1 || echo 0)"

# --- 3. Playwright 가 기대하는 Chromium 리비전이 컨테이너에 없으면, 있는 것을 그 이름으로 잇는다 ---
PW="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
if [ -d "$PW" ] && [ "$(has_dir "$LAB/node_modules/playwright-core")" = 1 ]; then
  EXP="$(cd "$LAB" && node -e "try{console.log(require('playwright-core').chromium.executablePath())}catch(e){}" 2>/dev/null)"
  REV="$(echo "$EXP" | sed -n 's#.*/chromium-\([0-9][0-9]*\)/.*#\1#p')"
  if [ -n "$REV" ] && [ ! -x "$EXP" ] && [ "$CHECK_ONLY" = 0 ]; then
    FULL="$(ls -d "$PW"/chromium-[0-9]*/chrome-linux 2>/dev/null | grep -v "chromium-$REV/" | head -1)"
    HEAD="$(ls -d "$PW"/chromium_headless_shell-[0-9]*/chrome-linux 2>/dev/null | grep -v "shell-$REV/" | head -1)"
    if [ -n "$FULL" ]; then
      mkdir -p "$PW/chromium-$REV" && ln -sfn "$FULL" "$PW/chromium-$REV/chrome-linux64" && touch "$PW/chromium-$REV/INSTALLATION_COMPLETE"
      say "Chromium 링크: chromium-$REV -> $(basename "$(dirname "$FULL")")"
    fi
    if [ -n "$HEAD" ]; then
      SH="$PW/chromium_headless_shell-$REV/chrome-headless-shell-linux64"
      mkdir -p "$SH"
      for f in "$HEAD"/*; do ln -sfn "$f" "$SH/$(basename "$f")"; done
      ln -sfn "$HEAD/headless_shell" "$SH/chrome-headless-shell"
      touch "$PW/chromium_headless_shell-$REV/INSTALLATION_COMPLETE"
      say "헤드리스 셸 링크: chromium_headless_shell-$REV"
    fi
  fi
  BROWSER_OK="$(cd "$LAB" && node -e "
    const {chromium}=require('playwright-core');
    chromium.launch().then(async b=>{await b.close();process.exit(0)}).catch(()=>process.exit(1))" >/dev/null 2>&1 && echo 1 || echo 0)"
  need "Chromium 이 뜬다" "$BROWSER_OK"
else
  need "Chromium (Playwright 경로 $PW 또는 playwright-core 없음)" 0
fi

# --- 4. 검사가 읽는 산출물. 순서가 중요하다: 도구 장 -> 언어 장 (하나만 다시 구우면 i18n:pair 가 빨갛다) ---
if [ "$(has_dir "$LAB/node_modules")" = 1 ]; then
  # 통짜 build 체인에서 산출물을 만드는 단계만 같은 순서로 (검사 단계와 gen:related 등 네트워크 단계는 뺀다)
  run_step() { # 라벨, 명령...
    local label="$1"; shift
    (cd "$LAB" && "$@" >/dev/null 2>&1) || { say "실패: $label"; return 1; }
  }
  if [ ! -f "$LAB/js/toolbox.js" ] && [ "$CHECK_ONLY" = 0 ]; then
    say "번들 굽기 (build:i18n, gen:*, node build.mjs)"
    run_step build:i18n npm run -s build:i18n &&
    run_step gen:type-pool npm run -s gen:type-pool &&
    run_step gen:word-pool npm run -s gen:word-pool &&
    run_step gen:arcade-catalog npm run -s gen:arcade-catalog &&
    run_step gen:locale-pages npm run -s gen:locale-pages &&
    run_step "node build.mjs" node build.mjs
  fi
  if [ ! -d "$ROOT/apps/blog/t" ] && [ "$CHECK_ONLY" = 0 ]; then
    say "gen:tool-pages -> gen:tool-pages-locale"
    run_step gen:tool-pages npm run -s gen:tool-pages &&
    run_step gen:tool-pages-locale npm run -s gen:tool-pages-locale
  fi
  need "js/toolbox.js" "$([ -f "$LAB/js/toolbox.js" ] && echo 1 || echo 0)"
  need "apps/blog/t (도구 장)" "$([ -d "$ROOT/apps/blog/t" ] && echo 1 || echo 0)"
fi

# --- 5. 선택: 봇 빌드 (test:chat, test:copresence) ---
if [ "$WITH_BOT" = 1 ]; then
  BOT="$ROOT/apps/discord-bots/apps/karmolab-bot"
  if [ ! -f "$BOT/dist/src/bot/karmolab-api.js" ] && [ "$CHECK_ONLY" = 0 ]; then
    say "karmolab-bot 빌드"
    (cd "$BOT" && npm run build >/dev/null 2>&1) || say "실패: 봇 빌드"
  fi
  need "karmolab-bot dist" "$([ -f "$BOT/dist/src/bot/karmolab-api.js" ] && echo 1 || echo 0)"
fi

say "환경: 한글 파일 이름 검사는 export LANG=C.UTF-8 LC_ALL=C.UTF-8 (현재 LANG='${LANG:-}')"
if [ "$MISSING" -gt 0 ]; then say "준비 안 된 것 $MISSING 개"; exit 1; fi
say "준비 끝"
exit 0
