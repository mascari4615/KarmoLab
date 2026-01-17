# YawnBot Server Deployment Guide

YawnBot을 Vultr 서버에 배포하고 GitHub Webhook을 연동한 과정을 정리한 가이드.

## 🖥️ Server Information

- <https://my.vultr.com/>
- **Hosting**: Vultr (Seoul Region)
- **IP Address**: `<SERVER_IP>`
- **OS**: Ubuntu 24.04 LTS
- **Runtime**: .NET 9.0 Runtime

## 🤖 Bot Configuration

- **Working Directory**: `/root/yawn-bot`
- **Port**: `8080` (Webhook Endpoint)
- **Environment Variables**:
  보안을 위해 실제 값은 `.env` 파일에 보관하고, 레포지토리에는 `.env.template`만 공유
  - `DISCORD_TOKEN`: 디스코드 봇 토큰
  - `GITHUB_WEBHOOK_CHANNEL_ID`: 알림을 보낼 채널 ID
  - `ASPNETCORE_URLS`: `http://*:8080` (웹훅 수신용)

## 🔐 Environment Variables (.env)

레포지토리를 공개할 때는 실제 값이 담긴 `.env` 파일은 절대 올리면 안 됨. 대신 아래처럼 관리:

1. **[.env.template](file:///c:/Users/masca/source/repos/_Mascari4615/KarmoLab/Apps/YawnBot/.env.template)** 파일을 복사해서 `.env` 파일 생성.
2. `.env` 파일에 발급받은 실제 토큰과 ID 입력.
3. `.gitignore`에 `.env`를 추가해서 실수로 GitHub에 올라가지 않게 보호.

## 🔗 GitHub Webhook Setup

- <https://github.com/mascari4615/KarmoLab/settings/hooks>
- **Payload URL**: `http://<SERVER_IP>:8080/webhook/github`
- **Content type**: `application/json`
- **Events**: Pushes, Issues, Pull requests, Issue comments
- **Secret**: (현재 설정되지 않음, 필요 시 추가 가능)

## ⚙️ Systemd Service (`yawn-bot.service`)

서버 재부팅 시 자동 실행 및 24시간 가동을 위해 `/etc/systemd/system/yawn-bot.service`에 등록되어 있음.

```ini
[Unit]
Description=YawnBot Service
After=network.target

[Service]
WorkingDirectory=/root/yawn-bot
ExecStart=/root/yawn-bot/YawnBot
Restart=always
RestartSec=5
Environment=ASPNETCORE_URLS=http://*:8080
Environment=GITHUB_WEBHOOK_CHANNEL_ID=<YOUR_CHANNEL_ID>

[Install]
WantedBy=multi-user.target
```

## 🛠️ Maintenance Commands (PowerShell)

사용자 컴퓨터의 PowerShell에서 아래 명령어를 사용하여 서버를 관리할 수 있음.

### 로그 확인 (실시간)

```powershell
ssh root@<SERVER_IP> "journalctl -u yawn-bot -f"
```

### 봇 재시작

```powershell
ssh root@<SERVER_IP> "systemctl restart yawn-bot"
```

### 파일 전송 (로컬 -> 서버)

```powershell
# publish 폴더의 내용물을 서버로 전송
scp -r .\bin\Release\net9.0\linux-x64\publish\* root@<SERVER_IP>:/root/yawn-bot/
```

### 방화벽 설정

```powershell
# 8080 포트 허용
ssh root@<SERVER_IP> "ufw allow 8080/tcp"
```
