# 유니티 패키지 배포 및 모노레포 관리 가이드

이 문서는 유니티 에디터/유틸리티 툴을 Unity Package Manager(UPM)를 통해 배포하고, 단일 리포지토리(모노레포)에서 여러 프로젝트를 효율적으로 관리하는 방법을 설명합니다.

---

## 1. UPM (Unity Package Manager) 개요
- **정의**: 유니티 전용 패키지 관리 시스템 (Node.js의 `npm`과 유사).
- **특징**: 프로젝트 외부(`LocalPackages` 또는 `UPM Registry`)에서 라이브러리를 관리하여 프로젝트 구조를 간결하게 유지하고 버전 관리를 용이하게 합니다.

---

## 2. 모노레포 프로젝트 구조 (추천: Local Packages)
여러 배포용 패키지를 하나의 리포지토리에서 관리할 때 가장 권장되는 구조입니다.

### 구조도
```
Unity/KarmoLab/
  ├── Assets/ (메인 프로젝트 에셋)
  ├── LocalPackages/ (배포용 패키지 루트)
  │    └── com.karmoddrine.karmoeditor/ (각 패키지 폴더)
  │         ├── package.json
  │         ├── Editor/
  │         └── Runtime/
  └── Packages/
       └── manifest.json (여기서 LocalPackages를 참조)
```

### 적용 방법
`Packages/manifest.json`에 직접 경로를 추가합니다.
```json
"dependencies": {
  "com.karmoddrine.karmoeditor": "file:../LocalPackages/com.karmoddrine.karmoeditor",
  ...
}
```

### 장점
1. **깔끔한 프로젝트**: 유니티 에디터 상에서 **Packages** 그룹 안에 묶여 보여 관리가 쉽습니다.
2. **실제 배포 구조 일치**: 로컬 개발 폴더 구조가 UPM 배포 구조와 동일합니다.
3. **IDE 기능 완벽 지원**: Visual Studio, Rider 등에서 인텔리센스 및 리팩토링 기능이 100% 동일하게 작동합니다.

---

## 3. 배포 전략 및 자동화

### 배포 전략 비교
| 비교 항목 | 배포 브랜치 (`upm`) 유통 | OpenUPM 등록 (권장) |
| :--- | :--- | :--- |
| **속도/용량** | 패키지 파일만 클론 (빠름) | 레지스트리 서버 바이너리 전송 (최속) |
| **설치 편의성** | Git URL 직접 입력 | OpenUPM 검색 및 UI 설치 |
| **의존성 해결** | 내장 의존성 해결 불가 (수동) | 타 패키지 의존성 자동 설치 지원 |
| **자동화** | GitHub Actions 직접 구성 필요 | GitHub Tag 생성 시 자동 빌드 |

### [추천] GitHub Actions 자동화 (`upm-publish.yml`)
`main` 브랜치에 푸시하거나 특정 형식의 태그를 달면 자동으로 배포용 브랜치를 갱신합니다.
- **태그 규칙**: `패키지명/v버전` (예: `com.karmoddrine.karmoeditor/v1.0.0`)
- **자동화 동작**: 지정된 폴더만 추출(Subtree Split)하여 `upm/패키지명` 브랜치로 푸시합니다.

---

## 4. 사용자 설치 방법

### 방식 1: Git URL (단순 공유)
1. `Window > Package Manager` 클릭.
2. `+` 버튼 -> `Add package from git URL...` 선택.
3. 배포 브랜치 URL 입력 (예: `https://github.com/user/repo.git#upm/karmo-editor`).

### 방식 2: Scoped Registry (OpenUPM)
1. `Edit > Project Settings > Package Manager` 이동.
2. **Scoped Registries** 등록:
   - **Name**: `OpenUPM`
   - **URL**: `https://package.openupm.com`
   - **Scope(s)**: `com.karmoddrine`
3. `Package Manager > My Registries` 탭에서 원클릭 설치 가능.

---

## 5. 자주 묻는 질문 (FAQ)

### Q: 나중에 이름을 바꿀 수 있나요?
A: 가능합니다. 다만 유니티가 새로운 패키지로 인식하므로 기존 사용자는 주소를 다시 등록해야 합니다.

### Q: 서버가 필요하나요?
A: 아니오. GitHub(Git URL 방식) 또는 OpenUPM(공용 레지스트리)을 사용하므로 별도의 서버 비용이나 설정이 필요 없습니다.

### Q: 폴더 경로를 옮기면 문제가 되나요?
A: 아니오. 관리자가 GitHub Actions 설정에서 소스 경로만 한 번 수정해 주면 됩니다. 사용자가 사용하는 배포 주소는 영향을 받지 않습니다.

### Q: IDE(VSCode/Rider)에서 인텔리센스가 작동하지 않아요.
A: 유니티 에디터의 `Preferences > External Tools`에서 **Generate .csproj files for:** 항목 중 **Local packages**가 체크되어 있는지 확인하고, **Regenerate project files** 버튼을 눌러 프로젝트 파일을 다시 생성하세요.
    - 만약 `Sharing violation` 에러가 발생한다면, IDE를 종료하고 프로젝트 루트의 `.csproj`와 `.sln` 파일을 수동으로 삭제한 뒤 다시 시도하세요.

### Q: 최소 지원 유니티 버전은 무엇인가요?
A: 현재 **Unity 6 (6000.3)** 버전을 기준으로 설정되어 있습니다.
