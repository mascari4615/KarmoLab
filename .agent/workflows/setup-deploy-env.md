---
description: 리눅스(Systemd) 환경에서 YawnBot의 환경 변수 설정 방법
---

이 워크플로우는 YawnBot을 호스팅하는 리눅스 서버에서 필수 환경 변수(`DISCORD_TOKEN`, `GEMINI_API_KEY`)를 설정하는 절차를 안내함.

# 사전 요구 사항 (Prerequisites)

- 대상 리눅스 서버에 대한 SSH 접속 권한 (예: `ssh root@<IP>`)
- Root 또는 sudo 권한 보유

# 수행 단계 (Steps)

1. **서버 접속 (Connect to Server)**
   터미널을 열고 서버에 SSH로 접속함.

   ```powershell
   ssh root@<YOUR_SERVER_IP>
   ```

2. **서비스 설정 파일 열기 (Open Configuration)**
   YawnBot의 systemd 서비스 파일을 편집함.

   ```bash
   sudo nano /etc/systemd/system/yawn-bot.service
   ```

3. **환경 변수 추가 (Add Environment Variables)**
   `[Service]` 섹션을 찾아 아래의 `Environment` 라인들을 추가함.
   *(자리표시자 값을 실제 키로 교체할 것)*

   ```ini
   [Service]
   # ... 기존 설정 ...
   Environment="DISCORD_TOKEN=YOUR_ACTUAL_DISCORD_TOKEN_HERE"
   Environment="GEMINI_API_KEY=YOUR_ACTUAL_GEMINI_API_KEY_HERE"
   Environment="GEMINI_MODEL=gemini-flash-latest"
   # ... 기존 설정 ...
   ```

   > **참고**: 값에 공백이 포함되지 않은 경우 따옴표가 필수는 아니나, 안전을 위해 권장함.

4. **저장 및 종료 (Save and Exit)**
   - `Ctrl + O` 후 `Enter`를 눌러 저장함.
   - `Ctrl + X`를 눌러 에디터를 종료함.

5. **서비스 재로드 및 재시작 (Reload and Restart)**
   변경 사항을 적용하고 봇을 재시작함.

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart yawn-bot
   ```

6. **상태 확인 (Verify Status)**
   새 환경 변수와 함께 봇이 정상적으로 시작되었는지 확인함.

   ```bash
   sudo systemctl status yawn-bot
   ```
