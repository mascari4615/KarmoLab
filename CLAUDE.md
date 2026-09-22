# mascari4615.github.io. AI 에이전트 작업 지침

블로그 + KarmoLab 앱 monorepo. 배포 = GitHub Pages, 도메인 `https://blog.mascari4615.com` (CNAME).
구조: `apps/blog/`는 사이트 조립 대상. Node의 `apps/karmolab/scripts/assemble-site.mjs`가 생성물과 정적 자산을 조립하며 Jekyll/Chirpy는 철거됨 / `apps/` 서브앱 (karmolab, discord-bots, karmolab-tauri 등) / `packages/ai/`(`@karmo/ai`) / `unity/` 유니티 프로젝트 (npm workspace 밖. 위 게이트와 무관).
**뿌리 = KarmoLab 앱** (change.karmolab-at-root, memo): `/` 가 앱 셸이고 `/t/<id>/`, `/u/`, `/bot/`, `/wm/`, `/c/`, `/play/`, `/sw.js` 가 그 켜에 선다. 옛 `/karmolab/*` 는 지원 안 함(404).
**블로그도 KarmoLab 파이프로 굽는다** (change.blog-cutover, memo): 글 정본은 `apps/karmolab/content/{posts,drafts}/`, 렌더는 `src/lib/markdown/`, 장 생성은 `scripts/gen-post-pages.mjs` (`/posts/<slug>/`, `/posts/` 정적 목록, `/about/`, `/works/`, `/feed.xml`). 사람 화면의 목록은 커뮤니티 게시판(`/?board=info#community`). `/posts/` 정적 목록은 크롤러용 링크 경로 (2026-09-03, 글 329편에 링크가 0 이었다).

## Post 규칙 (글 원본 = `apps/karmolab/content/posts/`)

**파일명**: `YYYY-MM-DD-slug-name.md` (kebab-case, slug = URL). 드래프트 = `content/drafts/`.

**Front matter**: `title` / `description` / `categories: [..]` / `tags: [..]` / `date: ISO8601(+09:00)` / `image` / `hidden`.

**`last_modified_at`**: 내용 변경 시만 갱신 (오타, 포맷 변경 X). 이력은 git 이 정본.

**글쓰기 스타일**: 절제 (중복, 자명한 내용 제거). 머리말(목적, 방향) / 꼬리말(선택) / 메모(참고, 키워드, 도토리, 기록).

**`hidden: true`**: 목록, 색인, 피드에서 제외, URL 직접 접근만.

**문법**: 표준 마크다운 + 우리 확장 (유튜브 URL 단독 줄 = 카드, ` ```mermaid ` = KarmoGraph · `> [!NOTE]` callout). Liquid/Kramdown 문법 금지. 렌더러가 모른다.

## 고치기, 검증, 카드 등록

절차 (dev 핫리로드, gates:changed, verify, audit:pages, 서버 모니터와 트레이 등록, localdev HTTP) 는 Skill `karmolab-dev`. 여기는 계약.

- 화면 작업은 `npm run dev` 로 보며 한다. 배포를 기다리거나 새로고침하지 않는다 (KL-100)
- 작업 중 `npm run build` 반복 금지. `gates:changed` 와 `tsc --noEmit`, 통짜는 push 직전 한 번 (KAR-231)
- 셸 (`index.html`) 을 고쳤으면 `npm run audit:pages`. 도구 상세 페이지가 거기서 찍힌다
- 새 봇, 로컬 서버, dev runner 는 코드와 `servermonitor-config.json` `devProfiles` 카드 한 묶음. `program/args` 손기재 금지 (Note 12)
- 봇 재기동은 사용자에게 안내하지 않고 localdev HTTP 로

## main invariant (`npm run verify`)

main 브랜치는 항상:
- `apps/karmolab` build (typecheck 포함) 통과
- `packages/ai`(`@karmo/ai`) build 통과
- `apps/karmolab-tauri/src-tauri` cargo check 통과 + ACL audit (`acl.toml ⟷ #[command] ⟷ caps` cross-check)
- typos check 통과

verify fail 시 SLO: 1시간 내 revert. 전체 검사는 root `npm run verify`와 CI가 실행한다. 실제 pre-push hook은 `memo/dotfiles/git-hooks/pre-push`이며 KarmoLab의 선별 검사를 실행한다.

## Tauri ACL (KL-063)

새 command 추가 = **2곳만**: ① 구현 `#[tauri::command] fn` ② `acl.toml` 알맞은 `[[group]].commands` 1줄.
`build.rs` 가 `acl.toml` 에서 handler + permissions 파생. `capabilities/default.json` 은 새 그룹 신설 시만 변경.

## IO 무거운 Tauri command = async 강제 (KL-043)

`fs::read_dir` 다중 / external process spawn(git, claude, gh) / 수 초 작업:
```rust
pub async fn cmd(params) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || cmd_blocking(params))
        .await.map_err(|e| format!("spawn_blocking join 실패: {}", e))?
}
```
단순 파일 R/W, toggle 등 <10ms = sync OK.

## AI (Vertex / Claude)

Vertex AI 선호 (credits 보유). `KARMO_AI_SURFACE=vertex` default. AI Studio = fallback only.
예외: 무한 텍스트 어드벤처 (KL-032) = Claude Max OAuth default, Vertex 토글 선택 가능.

## Git Workflow

정본 = `memo/rules/git.md`. main 직접 push default, force push 절대 금지.
PR 생성 케이스: autopilot Draft PR / CodeRabbit 리뷰 / 다른 세션 충돌 회피 worktree / 외부 협업.
Commit = Conventional Commits (`feat:`/`fix:`/`chore:` 등), pre-commit hook 강제.

## 공통 원칙

`memo/rules/` 정본 적용 (레거시 금지, 마이그 자기소멸, 한 commit 한 주제 등). 충돌 시 memo 룰 우선.
