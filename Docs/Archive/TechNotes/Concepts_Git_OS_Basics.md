# Tech Concepts: Git & OS Basics

KarmoLab 프로젝트 내 주요 개발 개념 정리 노트.

## 1. 심볼릭 링크 (Symbolic Link / Symlink)

### ❓ 무엇인가요?
파일이나 폴더를 가리키는 **"지름길"** 또는 **"가짜 파일"**. 윈도우의 '바로가기(.lnk)'와 유사하나, 시스템 수준에서 작동하여 프로그램이 실제 파일로 인식한다는 점이 다름.

### 🚀 왜 사용하나요? (KarmoLab 사례)
- **Single Source of Truth**: 원본 파일 하나만 두고, 여러 경로에서 해당 원본을 가리키게 함.
- **동기화 불필요**: 원본 문서 수정 시 가리키는 모든 심볼릭 링크에 즉시 반영.

### 🛠️ 사용 방법 (Windows)
**CMD (명령 프롬프트):**
```cmd
mklink "링크_경로" "원본_파일_경로"
```

**PowerShell (명령어):**
```powershell
Remove-Item -Force ".agent\Global_Instructions.md", ".github\copilot-instructions.md" ;
New-Item -ItemType SymbolicLink -Path ".agent\Global_Instructions.md" -Target "Docs\Standards\Global_Instructions.md" ;
New-Item -ItemType SymbolicLink -Path ".github\copilot-instructions.md" -Target "Docs\Standards\Global_Instructions.md"
```

### 🔍 연결 확인 방법
**PowerShell:**
```powershell
# 연결된 타겟 경로까지 상세 확인
Get-Item ".agent\Global_Instructions.md", ".github\copilot-instructions.md" | Select-Object Name, LinkType, Target
```

**CMD / 탐색기:**
- `dir` 명령어를 쳤을 때 `<SYMLINK>` 또는 모드에 `l` 표시가 있으면 성공.
- 탐색기에서 파일 아이콘 왼쪽 하단에 화살표(바로가기 모양)가 붙어있음.

---

## 2. .gitkeep

- Git은 **비어 있는 폴더를 추적(Track)하지 않음**. 폴더 안에 아무 파일도 없으면 커밋/푸시할 수 없음. 이때 폴더를 유지하기 위해 관습적으로 넣는 빈 파일. 현재는 비어 있지만, 나중에 문서가 들어올 폴더 구조를 미리 잡아두고 싶을 때 사용함.

---

## 3. 체크썸 (Checksum) / 해시 (Hash)

- 데이터의 **"지문"**. 파일의 내용이 1비트라도 바뀌면 완전히 다른 값이 생성됨.
- **무결성 검사**: 다운로드한 게임 파일이 중간에 깨지지 않았는지 확인하기 위해 KarmoHub 등에서 활용함.
