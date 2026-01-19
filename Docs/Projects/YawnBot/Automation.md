# 배포 자동화 가이드 (Deployment Automation Guide)

Summary: YawnBot 배포 프로세스를 스크립트로 자동화하는 과정 및 환경 설정 안내.

## 1. 사전 준비 (Environment Setup)

1. `.env` 파일에 서버 IP 추가:

    ```ini
    SERVER_IP=141.164.45.135
    ```

## 2. 비밀번호 없이 로그인 설정 (SSH Key Setup)

매번 비밀번호를 치지 않으려면 SSH 키를 설정해야 함. 이것이 "비밀번호 자동화"의 정석.

1. **키 생성** (이미 있다면 생략):

    ```powershell
    ssh-keygen -t rsa -b 4096
    # 엔터 계속 누름
    ```

2. **환경 변수 로드** (터미널에 붙여넣기):

    `deploy.ps1`을 사용하지 않고 터미널에서 직접 명령어를 칠 때는 `.env` 파일을 읽어오는 과정이 필요함.

    ```powershell
    Get-Content ".env" | ForEach-Object { if ($_ -match "^(?!#)(.+?)=(.*)") { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process") } }
    ```

3. **공개키 서버로 전송** (Windows PowerShell):

    ```powershell
    # 공개키 내용 읽기
    $key = Get-Content $env:USERPROFILE\.ssh\id_rsa.pub
    
    # 서버에 등록
    ssh root@$env:SERVER_IP "mkdir -p ~/.ssh && echo '$key' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && chmod 700 ~/.ssh"
    ```

    (이때 마지막으로 비밀번호 한 번 입력)

4. **테스트**:

    ```powershell
    ssh root@$env:SERVER_IP
    ```

    비밀번호 없이 접속되면 성공!

## 3. 배포 실행

```powershell
./scripts/deploy.ps1
```
