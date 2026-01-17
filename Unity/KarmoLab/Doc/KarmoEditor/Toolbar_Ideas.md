# KarmoEditor Toolbar 확장 아이디어

Unity 6.3의 `MainToolbar` API를 활용하여 작업 효율을 높일 수 있는 추가 기능 제안입니다.

## 1. 빌드 및 배포 도구 (Build & Deploy)
- **명칭**: Quick Build
- **기능**: `BuildToolWindow`의 기능을 툴바에서 즉시 실행.
- **UI**: 
  - 최근 빌드 타겟 표시 드롭다운.
  - 빌드/배포 즉시 실행 버튼.

## 2. 시간 제어기 (Time Scale Controller)
- **명칭**: Time Control
- **기능**: Play 모드에서 게임 속도(`Time.timeScale`)를 실시간 조절.
- **UI**: 
  - 슬라이더 (0x ~ 2x).
  - 일시정지(0) 및 정상속도(1) 퀵 버튼.

## 3. 그래픽 프리셋 전환 (Graphic Quality)
- **명칭**: Quality Picker
- **기능**: Quality Settings 프리셋을 한 번의 클릭으로 변경.
- **UI**: 
  - 현재 품질 수준 표시 드롭다운.

## 4. 씬 뷰 유틸리티 (Scene View Utils)
- **명칭**: Scene Helper
- **기능**: 자주 쓰이는 뷰 옵션 제어.
- **UI**: 
  - Gizmos On/Off 토글 버튼.
  - 그리드 표시 토글.
  - 특정 레이어(예: UI, Trigger) 가시성 토글.

## 5. 프로젝트 통계 (Project Stats)
- **명칭**: Stats Monitor
- **기능**: 런타임 성능 지표 실시간 확인.
- **UI**: 
  - FPS, 현재 메모리 사용량 텍스트 레이블.

## 6. 에셋 생성기 (Quick Create)
- **명칭**: Asset Factory
- **기능**: 자주 생성하는 KarmoTools 에셋들을 우클릭 메뉴 없이 즉시 생성.
- **UI**: 에셋 타입 선택 드롭다운.

## 7. 선택 히스토리 (Selection History)
- **명칭**: Navigation
- **기능**: 브라우저의 앞/뒤로 가기처럼 이전에 선택했던 GameObject/Asset으로 즉시 복귀.
- **UI**: 뒤로/앞으로 버튼.

## 8. 환경설정 토글 (Environment Context)
- **명칭**: Environment
- **기능**: 개발/스테이징/라이브 환경에 따른 Script Define symbols 또는 전역 설정을 원클릭 전환.
- **UI**: 환경 이름 표시 드롭다운.

## 9. 로컬라이징 테스트 (Localization Picker)
- **명칭**: Lang
- **기능**: 런타임 중 데이터 테이블의 언어 설정을 즉시 변경하여 UI 레이아웃 확인.
- **UI**: 현재 언어(KR/EN/JP 등) 드롭다운.

## 10. 오디오 마스터 제어 (Global Audio)
- **명칭**: Audio
- **기능**: 에디터 내 오디오 재생을 전체 뮤트하거나 볼륨 조절.
- **UI**: 뮤트 토글 아이콘 + 슬라이더.

## 11. 스크린샷 및 녹화 (Media Capture)
- **명칭**: Snap
- **기능**: UI를 제외한 순수 Game View 스크린샷 저장 또는 비디오 녹화 시작/정지.
- **UI**: 카메라 아이콘(스냅샷), 녹화 버튼.

---
**기술적 구현 제언**:
- 각 기능은 `MainToolbarElement` 속성을 가진 개별 정적 메서드로 구현하여 모듈화할 수 있습니다.
- 환경설정(`ScriptableObject`)을 통해 사용자가 원하는 툴바 항목만 활성화하도록 관리하는 것이 좋습니다.
