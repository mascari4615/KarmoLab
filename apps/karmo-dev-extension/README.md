# KarmoDevExtension (Chrome MV3)

로컬 앱(`chat-overlay` 등)과 브라우저 방송, 시청 페이지를 잇는 **KarmoDevExtension**입니다.

## 개발용 로드

1. Chrome `chrome://extensions` → **개발자 모드**
2. **압축해제된 확장 프로그램을 로드합니다** → 이 폴더(`karmo-dev-extension`) 선택

기존에 `stream-overlay-extension` 등으로 로드했다면 제거 후 이 폴더를 다시 로드하세요.

## 옵션 (ingest URL)

- 확장 아이콘 **클릭** → **설정(옵션) 열기** 버튼 (가장 쉬움)
- 또는 아이콘 **우클릭** → **옵션** / `chrome://extensions` → 세부정보 → **확장 프로그램 옵션**
- `http://127.0.0.1:<포트>/ingest` 입력 후 저장. **기본 주소로 저장** 버튼이면 17376으로 한 번에 맞춤.

## 즐겨찾기 정리 (v0.2)

확장 아이콘 → **즐겨찾기 정리 열기**. `chrome.bookmarks` API 로 읽고 지운다.

- **내보내기**: TSV / Markdown / JSON 클립보드 복사 (문서화용)
- **붙여넣기 일괄 삭제**: id, URL 을 줄 단위로 붙여넣기 → 미리보기 → 삭제
- **목록에서 고르기**: 검색 + 체크 선택 삭제

`Bookmarks` JSON 파일을 직접 고치는 방법은 **동기화가 되살린다** (2026-08-28 실측: 3건 삭제 → 새 id 로 부활).
확장 API 삭제는 동기화에도 그대로 전파되므로 이 경로를 써라.

## 원격 호출 (externally_connectable)

허용 도메인(`blog`, `127.0.0.1`, `localhost`) 페이지에서:

```js
chrome.runtime.sendMessage("<확장ID>", { type: "bookmarks.list" }, console.log);
// bookmarks.listAll / bookmarks.remove {ids} / bookmarks.removeTree {ids}
// bookmarks.pruneEmptyFolders / ext.version / ext.reload
```

`ext.reload` = 언팩 확장을 디스크에서 다시 읽는다 → **코드 고친 뒤 수동 새로고침 불필요**.
(단 그 핸들러가 없던 버전에서 올릴 때는 `edge://extensions` 새로고침 1회가 필요하다.)

## 할 일 큐 (v0.17.0, 포커스 안 뺏음)

로컬 스크립트가 bridge 탭을 열지 않고 확장을 부르는 길. 탭을 열 때마다 Edge 창이 앞으로 나오던 문제를 없앤다.

- 포트: `127.0.0.1:17378` (`background.js` 의 `QUEUE_BASE`). 스크립트 쪽 서버는 memo `projects/karmo-ai/scripts/ext-queue.mjs`
- 확장이 `GET /job` 을 묻는다. 200 이면 `{ id, kind, msg, open }`, 할 일이 없으면 204. 결과는 `POST /done/<id>` 에 JSON
- `kind: "ext.call"` 은 `msg` 를 bridge 로 부른 것과 같이 처리하고 응답도 같은 모양 (`{ ok, ... }`)
- `open` 이 있으면 그 주소를 뒤쪽 탭 (`active: false`) 으로 열고, 로드를 기다려 처리한 뒤 닫는다. `page.text` 는 그 탭 하나만 읽는다
- 큐로 부를 수 있는 것은 읽기뿐 (`QUEUE_TYPES`). 상태를 바꾸는 호출은 지금처럼 bridge 와 키 확인으로만
- 깨우기: 알람 30초. 서버가 떠 있으면 1초 간격으로 계속 묻고, 동시에 5개까지 처리. 서버가 없으면 한 번 묻고 쉰다
- 스크립트는 처음에 `ext.version` 을 큐로 물어 45초 안에 답이 없으면 (옛 판, Edge 꺼짐) bridge 탭 방식으로 되돌아가고 경고 한 줄
- 시험: memo `node --test projects/karmo-ai/scripts/ext-queue.test.mjs` (이 `background.js` 를 가짜 chrome 위에 실어 돈다)

## 다음 작업 예시

1. 치지직 라이브 시청 페이지에서 채팅 DOM 구조 확인
2. `content.js`의 `extractChatRows` 구현
3. **chat-overlay(Tauri)** 가 떠 있으면 `127.0.0.1:17376` 에서 `POST /ingest` 를 받고 오버레이로 표시함

## 설정

- 기본: `http://127.0.0.1:17376/ingest` (`content.js`의 `DEFAULT_INGEST_URL`)
- **옵션 페이지**에서 저장하면 그 값이 우선 (`chrome.storage.sync.ingestUrl`)

## 주의

각 방송 플랫폼 약관, 정책은 직접 확인하세요.
