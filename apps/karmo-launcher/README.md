# Karmo Launcher

내 프로그램 (KarmoLab, Dash, WM 등) 라이브러리. 목록, 받기, 설치, 버전, 실행, 제거. Steam 결의 사용자용 런처.

- 정본: memo `changes/launcher.md`, 조사 `notes/launcher/references-2026-09-25.md`
- 목록: `manifest.json` (이 파일이 main 에 올라가면 런처가 raw 주소로 읽음). 개발 중 로컬 파일은 `KARMO_LAUNCHER_MANIFEST=<경로>`
- 백엔드 `src-tauri/src/lib.rs`, 화면 `ui/` (번들러 없음)
- 로컬 실행: `npm run dev`. 릴리스 없이 실제 앱으로 확인. 식별자가 달라 설치된 런처와 같이 켜지고, 제목 옆 버전이 `v0.0.0-dev`, 자동 업데이트 안 함. 데이터 폴더도 별도지만 NSIS 앱 설치와 제거는 이 PC 의 실제 앱을 건드림. 앱 자동 업데이트 설정이 켜져 있으면 로컬 판도 실제 앱을 업데이트함. 설치된 런처가 자동 업데이트되면 로컬 판도 같이 꺼짐 (2026-11-05 시각 일치로 판단, 실행 파일 이름이 같음). 다시 `npm run dev`
- 설치판: `npm run build` (NSIS). 실측 시험: `cd src-tauri && cargo test -- --include-ignored`
- 설치 형식 (`install.format`): `nsis` (설치 프로그램, 상태는 HKCU Uninstall 레지스트리, 런처 밖에서 깐 것도 보임, minisign 서명 필수), `zip` (런처 데이터 폴더 `apps/<id>` 에 풂, 상태는 `.karmo-version`, GitHub 자산 sha256 필수, 끄기는 `install.exe` 와 그것을 띄운 `cmd.exe`, `node.exe` 부모까지 강제 종료), `local` (받지 않음, 작업 폴더 아래 `local.path` 가 있으면 `local.run` 실행)
- 최신 판 (`source.type`): `tauri-latest` (catalog 먼저, 없으면 latest.json), `gh-release` (`repo` 릴리스에서 `tag_prefix`, `asset_prefix`, `asset_suffix` 가 맞는 첫 자산)
- 비공개 목록: memo 저장소 `data/launcher/apps.json`. 런처에 GitHub 토큰이 있을 때만 받아 공개 목록 뒤에 붙임. 토큰은 자격 증명 관리자 `karmo-launcher:github`. 화면 오른쪽 위 열쇠에서 붙여 넣기 또는 이 PC 의 git 로그인 (`git:https://github.com`) 복사
- 동시 작업: 진행 상태는 앱별. 한 앱을 받는 동안 다른 앱을 조작할 수 있음. NSIS 설치와 제거 프로그램만 한 번에 하나 (`native_setup_turn`). 런처 자체 업데이트는 앱 작업이 다 끝난 뒤
- 외부 명령을 창 없이 띄우지 않음. 레지스트리, 프로세스, 자격 증명은 Windows API (Defender 오탐 2026-11-02, memo `changes/launcher.md`)
- 자동 업데이트: 판단은 `ui/updates.js` (시험 `node --test scripts/updates.test.mjs`), 실행은 `ui/app.js` 받기 줄. 30분마다 확인, 자동은 줄을 서서 동시에 둘, 손으로 누른 것은 바로 시작, 앱이 떠 있으면 꺼질 때까지 미룸. 앱별 방식 `auto`, `priority`, `launch`, `off`. 설정은 `settings.json` 의 `prefs`. 실측 memo `notes/launcher/e2e-auto-update-2026-11-05.ps1`
- 로컬 서버 항목: `local.port` 가 열려 있으면 다시 안 켜고 `local.open` 만 엶. 주소는 이 PC 만
- 트레이 시작: 인자 `--tray`. Windows 시작 등록은 설정에서 켤 때만 (HKCU Run)
- 마스코트: `art.mascot` 은 `ui/img/mascot-<이름>.webp` (공개), `art.mascot_private` 는 memo `data/launcher/mascots/` 경로 (비공개, 토큰으로 받아 하루 캐시). 없거나 못 읽으면 그림 없음 (기본 캐릭터 없음). 그림 규격 1024x1536 투명
- 창 크기 조절: 틀 없는 투명 창이라 판 가장자리 손잡이 (`.rz`) 가 `startResizeDragging` 을 부름
