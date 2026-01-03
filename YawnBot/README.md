# YawnBot

YawnBot은 C# .NET 9.0과 Discord.Net 라이브러리를 사용하여 개발된 디스코드 봇입니다.
주요 기능으로는 슬래시 커맨드(`/`)를 활용한 미니게임(강화, 배틀 등)과 관리 기능이 있습니다.

## 시작하기

### 필수 조건
- [.NET 9.0 SDK](https://dotnet.microsoft.com/download/dotnet/9.0) 이상
- 디스코드 봇 토큰 (https://discord.com/developers/applications 에서 생성)

### 설치 및 실행

1. 저장소를 클론합니다.
   ```bash
   git clone https://github.com/mascari4615/KarmoLab.git
   cd KarmoLab/YawnBot
   ```

2. 환경 변수 설정 (권장):
   `YawnBot` 폴더 내에 `.env` 파일을 생성하고 다음과 같이 토큰을 입력하세요.
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   ```
   *참고: `.env` 파일은 git에 포함되지 않도록 설정되어 있습니다.*

3. 실행:
   ```bash
   dotnet run
   ```
   `.env` 파일이 없으면 실행 시 토큰을 입력하라는 메시지가 나타납니다.

## 기능

이 봇은 **슬래시 커맨드(Slash Commands)** 만을 지원합니다. 채팅창에 `/`를 입력하여 사용 가능한 명령어를 확인하세요.

### 주요 명령어
- **/강화**: 무기를 강화하여 레벨을 올립니다.
- **/배틀**: 다른 사용자와 대결합니다.
- **/순위**: 현재 순위를 확인합니다.
- **/지원금**: 매일 지원금을 받습니다.

## 개발 환경

- **Framework**: .NET 9.0
- **Library**: Discord.Net
- **Architecture**: Dependency Injection, Service-Oriented Architecture

## 주의사항

- `config.json` 및 `.env` 파일에는 민감한 정보가 포함될 수 있으므로 절대 공개 저장소에 커밋하지 마세요.
- `Resources/img/meme/` 폴더는 저작권 문제로 인해 git에서 제외되었습니다.
