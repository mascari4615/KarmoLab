# Karmo Launcher

내 프로그램 (KarmoLab, Dash, WM 등) 라이브러리. 목록, 받기, 설치, 버전, 실행, 제거. Steam 결의 사용자용 런처.

- 정본: memo `changes/launcher.md`, 조사 `notes/launcher/references-2026-09-25.md`
- 목록: `manifest.json` (이 파일이 main 에 올라가면 런처가 raw 주소로 읽음). 개발 중 로컬 파일은 `KARMO_LAUNCHER_MANIFEST=<경로>`
- 백엔드 `src-tauri/src/lib.rs`, 화면 `ui/` (번들러 없음)
- 실행: `npm run dev`, 설치판: `npm run build` (NSIS). 실측 시험: `cd src-tauri && cargo test -- --include-ignored`
- 설치 상태는 NSIS 가 남기는 HKCU Uninstall 레지스트리에서 읽음. 런처 밖에서 깐 것도 보임
