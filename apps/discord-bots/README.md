# Discord Bots Workspace

이 디렉터리는 디스코드 봇들을 위한 독립 워크스페이스입니다.

## 앱 목록

- `apps/karmolab-bot`: 게임/슬래시/음성/AI/Unity 무료 에셋, 긱뉴스 알림 통합 봇. 앱별 요약은 [`apps/karmolab-bot/README.md`](apps/karmolab-bot/README.md)

> 이전 `apps/atkup-bot` (Unity 무료, 긱뉴스 알림 별도 봇) 은 TASK-YB-003 (2026-05) 에서 karmolab-bot 안 `services/notifiers/` + `/atkup` 슬래시로 흡수 폐기. 봇 1개 / 토큰 1개 / `.env` 1개로 운영 통합.

## 설치

```bash
cd apps/discord-bots
npm install
```

## 실행

```bash
npm run start             # = npm run start:karmolab-bot
npm run start:karmolab-bot
```

### 앱 단위(직접 `-w`)

```bash
npm -w apps/karmolab-bot run build
npm -w apps/karmolab-bot run start
```

## 커맨드 배포

```bash
npm run deploy            # = npm run deploy:karmolab-bot
npm run deploy:karmolab-bot

# 또는 앱 단위
npm -w apps/karmolab-bot run deploy
```

## 레거시 `apps/karmolab-bot-server`

이 폴더의 `npm run start` / `build` / `deploy` 는 위 `apps/discord-bots` 워크스페이스로 **위임**됩니다. 최초 1회는 `apps/discord-bots`에서 `npm install`이 필요합니다.
