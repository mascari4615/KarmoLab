# KarmoLab 프로젝트 로드맵

## 🎯 최종 목표
- **KarmoHub**: 통합 런처. 게임 설치, 실행, 업데이트 관리.
- **KarmoLab (Game)**: Unity 기반 게임. Windows 정식 프로그램으로 설치됨.
- **배포 자동화**: GitHub Actions를 통해 빌드부터 배포까지 원클릭 처리.

## 📝 TODO 리스트

### Phase 1: KarmoHub 자체 설치 기능 구현 (완료)
- [x] **GitHub API 연동**: `KarmoLab` 리포지토리의 최신 Release 정보(`version`, `asset url`) 가져오기.
  - Pre-release 포함 검색 지원.
- [x] **다운로드 및 설치 로직**:
  - `DownloadUrl`로 ZIP 파일 다운로드 (스트림 처리).
  - 설치 경로: `KarmoHub_Execution_Path/Games/{GameId}/`.
  - **압축 해제 최적화**: `.7z` 대신 표준 `.zip` 사용 및 스트림 방식 UI 진행률 업데이트.
- [x] **UI/UX 개선**:
  - 설치 진행률 표시 (다운로드 % -> 압축 해제 %).
  - 설치 폴더 열기 기능.
  - 실시간 로그 콘솔 추가.

### Phase 2: 배포 자동화 (GitHub Actions)
- [ ] **Unity Build Action**: 클라우드 상에서 Unity 프로젝트 빌드.
- [ ] **Zip Artifact**: 빌드 결과물을 `.zip`으로 압축.
- [ ] **Release Upload**: 자동으로 태그 생성하고 Release에 업로드.
