# KarmoLab 아키텍처 개요 (Architecture Overview)

Summary: KarmoLab 전체 시스템 아키텍처 및 모듈 구조 설명.

## 🏗️ 전체 시스템 구조

KarmoLab은 사용자의 로컬 환경에서 구동되는 앱들과 Unity 기반의 게임 콘텐츠, 그리고 이를 서포트하는 자동화 도구들로 구성됨.

### 1. KarmoHub (C# / WPF)

- 모든 앱과 콘텐츠의 진입점.
- 사용자 인증, 업데이트 관리, 설정 동기화 담당.

### 2. KarmoToys (Unity)

- 메인 게임 콘텐츠.
- 인형 메이드와의 상호작용 및 수집 요소 구현.

### 3. KarmoEditor (Unity Editor)

- 마스터(개발자)를 위한 콘텐츠 에디팅 도구.
- 자동화된 에셋 파이프라인.

### 4. YawnBot (Discord)

- 커뮤니티 및 프로젝트 알림 봇.

## 📡 데이터 흐름

1. 사용자가 KarmoHub 실행.
2. Hub가 최신 상태 체크 후 게임(Toys) 실행.
3. 게임 내 데이터는 향후 클라우드 또는 로컬 데이터베이스와 동기화 계획.
